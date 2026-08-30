// The A/B holdout coin flip (docs/roadmap.md Hardening). Pure and
// deterministic — same discipline as packages/sdk: no Math.random(), no
// Date.now(). Given the same seed and holdbackPercent, always returns the
// same answer, which is the whole point: src/lib/embed/service.ts calls
// this independently from both getEmbedElements (deciding what to show)
// and recordSiteEvent (deciding what to record) and the two must agree
// without either one trusting the other.
//
// A hash-based split, not real randomness — deterministic-per-seed is a
// feature here, not a compromise: it's what makes a tracked visitor land
// in the same bucket for their whole lifetime, and what makes two
// independent calls for the same page load agree without coordination.

// djb2 — simple, well-distributed enough for a non-cryptographic traffic
// split, no dependency needed.
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0; // unsigned 32-bit
}

// True means "hold this visit back to the default" — the caller only
// calls this once it already knows the visit would otherwise have been
// personalized; a holdbackPercent of 0 (the default for every site until
// a merchant opts in) always returns false regardless of seed.
export function shouldHoldOut(seed: string, holdbackPercent: number): boolean {
  if (holdbackPercent <= 0) return false;
  if (holdbackPercent >= 100) return true;
  return hashString(seed) % 100 < holdbackPercent;
}
