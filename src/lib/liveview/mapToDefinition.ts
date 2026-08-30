import type {
  Audience,
  AudienceRule,
  ContentElement,
  ElementPersonalizationRule,
  ElementVariant,
} from "@/generated/prisma/client";
import type {
  AudienceDefinition,
  AudienceRuleDefinition,
  ComponentDefinition,
  PageDefinition,
  RuleOperator,
} from "@dynamify/personalization-sdk";

type ElementWithRelations = ContentElement & {
  variants: ElementVariant[];
  personalizationRules: ElementPersonalizationRule[];
};

type AudienceWithRules = Audience & { rules: AudienceRule[] };

// Maps a crawled page's real content elements into the SDK's PageDefinition
// shape, completely unmodified from what the page-hosting model's mapper
// produces — this is the actual proof that the engine is reusable across
// content sources, per CLAUDE.md's "extractable into its own package
// without rewriting" requirement. Content wraps as `{ text }` since the
// SDK's defaultContent is a generic Record<string, unknown>.
export function mapSiteToDefinition(input: {
  pageId: string;
  elements: ElementWithRelations[];
  audiences: AudienceWithRules[];
}): PageDefinition {
  const components: ComponentDefinition[] = input.elements.map((el, order) => ({
    id: el.id,
    type: el.elementType,
    section: el.section,
    order,
    defaultContent: { text: el.currentContent },
    variants: el.variants.map((v) => ({ id: v.id, content: { text: v.content } })),
    personalizationRules: el.personalizationRules.map((rule) => ({
      id: rule.id,
      audienceId: rule.audienceId,
      componentVariantId: rule.elementVariantId,
      priority: rule.priority,
      updatedAt: rule.updatedAt.toISOString(),
    })),
  }));

  const audiences: AudienceDefinition[] = input.audiences.map((audience) => ({
    id: audience.id,
    name: audience.name,
    rules: audience.rules.map(
      (rule): AudienceRuleDefinition => ({
        id: rule.id,
        field: rule.field,
        operator: rule.operator as RuleOperator,
        value: rule.value,
        groupIndex: rule.groupIndex,
      }),
    ),
  }));

  return { id: input.pageId, audiences, components };
}
