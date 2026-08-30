import { randomBytes, createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrfGuard";
import type { EventType, WebhookSubscription } from "@/generated/prisma/client";

export class WebhookNotFoundError extends HttpError {
  constructor() {
    super(404, "Webhook not found");
  }
}

export type WebhookDTO = {
  id: string;
  url: string;
  eventTypes: EventType[];
  active: boolean;
  createdAt: string;
};

// The signing secret is only ever returned once, at creation — same
// principle as a session token (CLAUDE.md: never log/expose secrets after
// the fact).
export type WebhookCreatedDTO = WebhookDTO & { signingSecret: string };

function toDTO(webhook: WebhookSubscription): WebhookDTO {
  return {
    id: webhook.id,
    url: webhook.url,
    eventTypes: webhook.eventTypes,
    active: webhook.active,
    createdAt: webhook.createdAt.toISOString(),
  };
}

export async function listWebhooks(organizationId: string): Promise<WebhookDTO[]> {
  const webhooks = await prisma.webhookSubscription.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return webhooks.map(toDTO);
}

export async function createWebhook(
  organizationId: string,
  url: string,
  eventTypes: EventType[],
): Promise<WebhookCreatedDTO> {
  try {
    await assertSafeExternalUrl(url);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new HttpError(400, error.message);
    throw error;
  }

  const signingSecret = randomBytes(32).toString("hex");
  const webhook = await prisma.webhookSubscription.create({
    data: { organizationId, url, eventTypes, signingSecret },
  });

  return { ...toDTO(webhook), signingSecret };
}

export async function deleteWebhook(organizationId: string, webhookId: string): Promise<void> {
  const webhook = await prisma.webhookSubscription.findFirst({
    where: { id: webhookId, organizationId },
  });
  if (!webhook) throw new WebhookNotFoundError();
  await prisma.webhookSubscription.delete({ where: { id: webhookId } });
}

type DispatchableEvent = {
  organizationId: string;
  type: EventType;
  pageId: string;
  componentId?: string | null;
  componentVariantId?: string | null;
  createdAt: Date;
};

// Fire-and-forget from the caller's perspective (never blocks the request
// that triggered it), but internally time-boxed and defensive — a broken or
// malicious webhook endpoint can't hang or crash event collection.
export async function dispatchEvent(event: DispatchableEvent): Promise<void> {
  const webhooks = await prisma.webhookSubscription.findMany({
    where: { organizationId: event.organizationId, active: true, eventTypes: { has: event.type } },
  });

  await Promise.allSettled(webhooks.map((webhook) => deliver(webhook, event)));
}

async function deliver(webhook: WebhookSubscription, event: DispatchableEvent): Promise<void> {
  try {
    await assertSafeExternalUrl(webhook.url); // re-check at dispatch time, not just at registration
  } catch {
    return;
  }

  const body = JSON.stringify({
    type: event.type,
    pageId: event.pageId,
    componentId: event.componentId ?? undefined,
    componentVariantId: event.componentVariantId ?? undefined,
    createdAt: event.createdAt.toISOString(),
  });
  const signature = createHmac("sha256", webhook.signingSecret).update(body).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Dynamify-Signature": signature },
      body,
      redirect: "error", // never silently follow a redirect to an internal address
      signal: controller.signal,
    });
  } catch {
    // Delivery failures are swallowed — never let a broken webhook endpoint
    // affect the request that generated the event.
  } finally {
    clearTimeout(timeout);
  }
}
