import { matchAudience } from "./audience";
import type {
  ComponentDefinition,
  PageDefinition,
  PersonalizationRuleDefinition,
  ResolvedComponent,
  ResolvedPage,
  VisitorContext,
} from "./types";

type CandidateRule = {
  rule: PersonalizationRuleDefinition;
  specificity: number;
};

// D5: explicit priority -> specificity -> most-recently-updated -> rule id.
// Never depends on array or object-key order.
function compareCandidates(a: CandidateRule, b: CandidateRule): number {
  if (a.rule.priority !== b.rule.priority) return b.rule.priority - a.rule.priority;
  if (a.specificity !== b.specificity) return b.specificity - a.specificity;

  const aUpdated = Date.parse(a.rule.updatedAt);
  const bUpdated = Date.parse(b.rule.updatedAt);
  if (Number.isFinite(aUpdated) && Number.isFinite(bUpdated) && aUpdated !== bUpdated) {
    return bUpdated - aUpdated;
  }

  return a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0;
}

function resolveComponent(
  context: VisitorContext,
  component: ComponentDefinition,
  audienceById: Map<string, PageDefinition["audiences"][number]>,
): ResolvedComponent {
  const base: ResolvedComponent = {
    id: component.id,
    type: component.type,
    section: component.section,
    order: component.order,
    content: component.defaultContent,
  };

  try {
    const candidates: CandidateRule[] = [];

    for (const rule of component.personalizationRules) {
      const audience = audienceById.get(rule.audienceId);
      if (!audience) continue; // dangling reference: never a match, never a throw

      const { matched, specificity } = matchAudience(context, audience);
      if (matched) candidates.push({ rule, specificity });
    }

    if (candidates.length === 0) return base;

    candidates.sort(compareCandidates);
    const winner = candidates[0].rule;
    const variant = component.variants.find((v) => v.id === winner.componentVariantId);
    if (!variant) return base; // dangling reference: fall back to default

    return {
      ...base,
      content: variant.content,
      matchedVariantId: variant.id,
      matchedRuleId: winner.id,
    };
  } catch {
    // Any unexpected failure anywhere in this component's resolution: the
    // default is always correct, so it's always safe to fall back to it.
    return base;
  }
}

// Pure, deterministic, no I/O — CLAUDE.md's non-negotiable core: same input
// always yields the same output, and no failure path ever throws. The outer
// try/catch guards against a malformed PageDefinition itself (e.g. a null
// `components`/`audiences` array from a corrupted compiled blob); the
// per-component try/catch inside resolveComponent guards against a bad rule
// on an otherwise-healthy page without losing every other component.
export function resolve(context: VisitorContext, page: PageDefinition): ResolvedPage {
  try {
    const audiences = Array.isArray(page?.audiences) ? page.audiences : [];
    const audienceById = new Map(audiences.map((a) => [a.id, a]));

    const componentList = Array.isArray(page?.components) ? page.components : [];
    const components = [...componentList]
      .sort((a, b) => a.order - b.order)
      .map((component) => resolveComponent(context, component, audienceById));

    return { id: page.id, components };
  } catch {
    return { id: page?.id ?? "unknown", components: [] };
  }
}
