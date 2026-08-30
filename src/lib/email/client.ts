import { z } from "zod";
import { env } from "@/lib/env";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/errors";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const MAX_TIMEOUT_MS = 10_000;

const resendResponseSchema = z.object({ id: z.string() });

// The one swappable interface every transactional email in this app goes
// through — a provider swap later is a rewrite of this file alone, not a
// hunt through every caller. Talks to Resend's plain REST API directly
// (no SDK dependency), same pattern as callOpenAiImage
// (src/lib/sites/generateImage.ts) and enrichIp
// (src/lib/enrichment/ipFirmographics.ts): checks configuration before any
// network call, since a missing key is never user-facing here — there's
// nothing to degrade gracefully into except "this didn't happen," which is
// exactly what every current caller already does with
// EmailNotConfiguredError.
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!env.RESEND_API_KEY) throw new EmailNotConfiguredError();

  let response: Response;
  try {
    response = await fetch(`${env.RESEND_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM_ADDRESS,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(MAX_TIMEOUT_MS),
    });
  } catch {
    throw new EmailSendError("Email request failed. Try again.");
  }

  if (!response.ok) throw new EmailSendError("Email provider returned an error.");

  const parsed = resendResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new EmailSendError("Email provider returned an unexpected shape.");
}
