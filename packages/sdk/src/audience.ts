import type { AudienceDefinition, AudienceRuleDefinition, VisitorContext } from "./types";

// Dotted-path lookup over the fixed VisitorContext shape, plus a free-form
// "attributes.*" bucket. Never throws — an unknown or missing path is
// treated as "absent", the same as a field the visitor context doesn't have.
function getFieldValue(context: VisitorContext, field: string): unknown {
  const parts = field.split(".");
  let cursor: unknown = context;

  for (const part of parts) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return cursor;
}

function toComparableString(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase();
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

// Never throws — a malformed rule (bad operator, wrong value shape) is
// simply a non-match, same as CLAUDE.md's "failure path renders the
// default" rule applied one level down.
function evaluateCondition(context: VisitorContext, rule: AudienceRuleDefinition): boolean {
  try {
    const fieldValue = getFieldValue(context, rule.field);

    switch (rule.operator) {
      case "EXISTS": {
        const shouldExist = rule.value === false ? false : true;
        const exists = fieldValue !== undefined && fieldValue !== null;
        return exists === shouldExist;
      }

      case "EQUALS": {
        const a = toComparableString(fieldValue);
        const b = toComparableString(rule.value);
        return a !== undefined && b !== undefined && a === b;
      }

      case "NOT_EQUALS": {
        const a = toComparableString(fieldValue);
        const b = toComparableString(rule.value);
        if (a === undefined) return false; // unknown attribute: no opinion either way
        return b === undefined || a !== b;
      }

      case "CONTAINS": {
        if (Array.isArray(fieldValue)) {
          const needle = toComparableString(rule.value);
          return (
            needle !== undefined &&
            fieldValue.some((item) => toComparableString(item) === needle)
          );
        }
        const haystack = toComparableString(fieldValue);
        const needle = toComparableString(rule.value);
        return haystack !== undefined && needle !== undefined && haystack.includes(needle);
      }

      case "IN": {
        if (!Array.isArray(rule.value)) return false;
        const a = toComparableString(fieldValue);
        if (a === undefined) return false;
        return rule.value.some((item) => toComparableString(item) === a);
      }

      case "GREATER_THAN": {
        const a = toNumber(fieldValue);
        const b = toNumber(rule.value);
        return a !== undefined && b !== undefined && a > b;
      }

      case "LESS_THAN": {
        const a = toNumber(fieldValue);
        const b = toNumber(rule.value);
        return a !== undefined && b !== undefined && a < b;
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

export type AudienceMatchResult = {
  matched: boolean;
  // Size of the largest matching AND-group — the D5 specificity measure.
  specificity: number;
};

// Rules sharing a groupIndex are ANDed; groups are ORed (disjunctive normal
// form). An audience with no rules never matches anyone — it takes at least
// one explicit condition to target a visitor.
export function matchAudience(
  context: VisitorContext,
  audience: AudienceDefinition,
): AudienceMatchResult {
  const groups = new Map<number, AudienceRuleDefinition[]>();
  for (const rule of audience.rules) {
    const group = groups.get(rule.groupIndex) ?? [];
    group.push(rule);
    groups.set(rule.groupIndex, group);
  }

  let specificity = 0;
  let matched = false;

  for (const rules of groups.values()) {
    if (rules.length === 0) continue;
    const groupMatched = rules.every((rule) => evaluateCondition(context, rule));
    if (groupMatched) {
      matched = true;
      specificity = Math.max(specificity, rules.length);
    }
  }

  return { matched, specificity };
}
