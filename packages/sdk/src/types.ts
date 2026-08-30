// Pure types for the personalization engine. Deliberately decoupled from
// Prisma's generated types — this is the boundary that keeps the engine
// extractable into its own SDK package without a rewrite (CLAUDE.md).

export type VisitorContext = {
  geo?: { country?: string; region?: string; city?: string };
  device?: "desktop" | "mobile" | "tablet" | "unknown";
  referrer?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  returning?: boolean;
  sessionCount?: number;
  attributes?: Record<string, string | number | boolean>;
};

export type RuleOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "CONTAINS"
  | "IN"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "EXISTS";

export type AudienceRuleDefinition = {
  id: string;
  field: string;
  operator: RuleOperator;
  value: unknown;
  groupIndex: number;
};

export type AudienceDefinition = {
  id: string;
  // Presentational only — resolve()/matchAudience() never read this, it
  // exists purely so a caller can show *which* audience matched (e.g.
  // Live View's "why this changed" attribution) without a second lookup.
  name?: string;
  rules: AudienceRuleDefinition[];
};

export type ComponentVariantDefinition = {
  id: string;
  content: Record<string, unknown>;
};

export type PersonalizationRuleDefinition = {
  id: string;
  audienceId: string;
  componentVariantId: string;
  priority: number;
  updatedAt: string; // ISO timestamp — part of the D5 specificity tiebreak
};

export type ComponentDefinition = {
  id: string;
  type: string;
  // Presentational only, same as AudienceDefinition.name — carried
  // through resolve() unchanged so a caller can lay content out by
  // section (Hero/Features/Testimonials/...) without a second lookup.
  section?: string;
  order: number;
  defaultContent: Record<string, unknown>;
  variants: ComponentVariantDefinition[];
  personalizationRules: PersonalizationRuleDefinition[];
};

export type PageDefinition = {
  id: string;
  audiences: AudienceDefinition[];
  components: ComponentDefinition[];
};

export type ResolvedComponent = {
  id: string;
  type: string;
  section?: string;
  order: number;
  content: Record<string, unknown>;
  // undefined when the default rendered — used for impression tracking.
  matchedVariantId?: string;
  matchedRuleId?: string;
};

export type ResolvedPage = {
  id: string;
  components: ResolvedComponent[];
};
