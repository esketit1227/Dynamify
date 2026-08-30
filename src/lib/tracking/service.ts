import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { dispatchEvent } from "@/lib/integrations/service";
import type { CollectEventInput } from "@/lib/validation/collect";
import { Prisma } from "@/generated/prisma/client";

export class PageNotPublishedError extends HttpError {
  constructor() {
    super(404, "Page not found");
  }
}

// Only ever accepts events for a currently published page — never a
// draft/archived one. That's what keeps this public endpoint from being a
// way to probe which pages exist in draft, or attribute events to content
// nobody can actually see (CLAUDE.md: public endpoints serve only published
// state).
export async function recordEvent(input: CollectEventInput): Promise<void> {
  const page = await prisma.page.findFirst({
    where: { id: input.pageId, publishedVersionId: { not: null } },
    select: { id: true, organizationId: true, publishedVersionId: true },
  });
  if (!page) throw new PageNotPublishedError();

  // upsert() isn't a single atomic statement for every driver, so two of a
  // brand-new visitor's events (e.g. PAGE_VIEW and PERSONALIZATION_IMPRESSION,
  // fired back-to-back without awaiting each other) can both see "doesn't
  // exist yet" and race to create it. Whichever loses the race just means
  // the row already exists, which is the outcome we wanted anyway.
  try {
    await prisma.visitor.create({
      data: { id: input.visitorId, organizationId: page.organizationId },
    });
  } catch (error) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isDuplicate) throw error;
  }

  // Never trust a client-supplied campaignId at face value — only attribute
  // the event if it's genuinely the active campaign for this exact page in
  // this org, otherwise silently drop the attribution (never fail the
  // event over it).
  let campaignId: string | undefined;
  if (input.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: input.campaignId, pageId: page.id, organizationId: page.organizationId },
      select: { id: true },
    });
    campaignId = campaign?.id;
  }

  const event = await prisma.event.create({
    data: {
      organizationId: page.organizationId,
      pageId: page.id,
      pageVersionId: page.publishedVersionId,
      visitorId: input.visitorId,
      campaignId,
      type: input.type,
      componentId: input.componentId,
      componentVariantId: input.componentVariantId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });

  // Fire-and-forget: webhook delivery is time-boxed and never throws (see
  // dispatchEvent), so this never delays or fails the collection response.
  void dispatchEvent({
    organizationId: page.organizationId,
    type: event.type,
    pageId: event.pageId,
    componentId: event.componentId,
    componentVariantId: event.componentVariantId,
    createdAt: event.createdAt,
  });
}
