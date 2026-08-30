import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { AiNotConfiguredError } from "@/lib/ai/errors";

// No key was provided for this session — this throws rather than returning
// a fake client, so callers fail loudly ("AI isn't configured yet") instead
// of silently fabricating output. See docs/session report: Phase 5 was
// built with a real integration wrapper but a stubbed call by design.
export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiNotConfiguredError();
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export const AI_MODEL = "claude-sonnet-5";
