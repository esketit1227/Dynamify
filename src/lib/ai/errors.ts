import { HttpError } from "@/lib/auth/errors";

export class AiNotConfiguredError extends HttpError {
  constructor() {
    super(503, "AI isn't configured yet — set ANTHROPIC_API_KEY to enable it.");
  }
}

export class ImageGenerationNotConfiguredError extends HttpError {
  constructor() {
    super(503, "Image generation isn't configured yet — set OPENAI_API_KEY to enable it.");
  }
}

export class AiGenerationError extends HttpError {
  constructor(message = "AI generation failed. Try again.") {
    super(502, message);
  }
}

// D4 (docs/decisions.md): thrown when generated copy fails either the
// whitelist check or the independent fact-checking model pass — the
// content is discarded, never shown as a suggestion, same as if the AI
// weren't configured at all (see suggestVariant.ts's catch handling).
export class BrandSafetyViolationError extends HttpError {
  constructor(message = "Generated content failed brand-safety validation.") {
    super(502, message);
  }
}
