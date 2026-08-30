import { z } from "zod";

// Blocks script-executing URL schemes in any content string — several
// personalizable element types (CTA_HREF, IMAGE, LOGO) put this text
// directly into an href/src a visitor's browser loads, so a malicious/
// compromised value here would be stored XSS against that org's own
// visitors otherwise. Applied to every content string, not just the
// "url"-kind ones, since a manually-typed or AI-generated value could
// end up used as a link either way.
export const DANGEROUS_URL_SCHEME = /^\s*(javascript|data|vbscript):/i;
export const safeContentString = z
  .string()
  .max(2000)
  .refine((value) => !DANGEROUS_URL_SCHEME.test(value), "That value isn't allowed here");
