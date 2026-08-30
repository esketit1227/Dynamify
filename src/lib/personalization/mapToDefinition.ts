import type {
  Audience,
  AudienceRule,
  Component,
  ComponentVariant,
  PersonalizationRule,
} from "@/generated/prisma/client";
import type {
  AudienceDefinition,
  AudienceRuleDefinition,
  ComponentDefinition,
  PageDefinition,
  RuleOperator,
} from "@dynamify/personalization-sdk";

type ComponentWithRelations = Component & {
  variants: ComponentVariant[];
  personalizationRules: PersonalizationRule[];
};

type AudienceWithRules = Audience & { rules: AudienceRule[] };

function toAudienceRuleDefinition(rule: AudienceRule): AudienceRuleDefinition {
  return {
    id: rule.id,
    field: rule.field,
    operator: rule.operator as RuleOperator,
    value: rule.value,
    groupIndex: rule.groupIndex,
  };
}

function toAudienceDefinition(audience: AudienceWithRules): AudienceDefinition {
  return {
    id: audience.id,
    rules: audience.rules.map(toAudienceRuleDefinition),
  };
}

function toComponentDefinition(component: ComponentWithRelations): ComponentDefinition {
  return {
    id: component.id,
    type: component.type,
    order: component.order,
    defaultContent: component.defaultContent as Record<string, unknown>,
    variants: component.variants.map((v) => ({
      id: v.id,
      content: v.content as Record<string, unknown>,
    })),
    personalizationRules: component.personalizationRules.map((rule) => ({
      id: rule.id,
      audienceId: rule.audienceId,
      componentVariantId: rule.componentVariantId,
      priority: rule.priority,
      updatedAt: rule.updatedAt.toISOString(),
    })),
  };
}

// Maps Prisma-shaped rows into the pure, DB-free PageDefinition the engine
// consumes. Used at publish time (compiled into PageVersion.compiledContent)
// and nowhere else — the engine itself never imports Prisma.
export function mapToDefinition(input: {
  pageId: string;
  components: ComponentWithRelations[];
  audiences: AudienceWithRules[];
}): PageDefinition {
  return {
    id: input.pageId,
    audiences: input.audiences.map(toAudienceDefinition),
    components: input.components.map(toComponentDefinition),
  };
}
