import { HttpError } from "@/lib/auth/errors";

// Same posture as AiNotConfiguredError/ImageGenerationNotConfiguredError
// (src/lib/ai/errors.ts) — no key set is an expected, common state in this
// app, not a bug, so this is a distinct type from a genuine send failure:
// callers can (and do) treat "not configured" as "silently skip" while
// still surfacing a real provider error.
export class EmailNotConfiguredError extends HttpError {
  constructor() {
    super(503, "Email isn't configured yet — set RESEND_API_KEY to enable it.");
  }
}

export class EmailSendError extends HttpError {
  constructor(message = "Failed to send email. Try again.") {
    super(502, message);
  }
}
