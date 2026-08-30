// Public entry point of the personalization SDK. This is the whole engine —
// pure, deterministic, no I/O (no DB, no network, no Date.now()/Math.random()
// without injection) — see CLAUDE.md. Consumed today by the Next.js app both
// server-side (publish-time compilation) and client-side (the D1/D2 resolver
// shipped to the browser bundle); designed to be consumed the same way by
// anything else without a rewrite.

export { resolve } from "./resolve";
export { matchAudience, type AudienceMatchResult } from "./audience";
export type {
  VisitorContext,
  RuleOperator,
  AudienceRuleDefinition,
  AudienceDefinition,
  ComponentVariantDefinition,
  PersonalizationRuleDefinition,
  ComponentDefinition,
  PageDefinition,
  ResolvedComponent,
  ResolvedPage,
} from "./types";
