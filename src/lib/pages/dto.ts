import type {
  Component,
  ComponentVariant,
  Page,
  PersonalizationRule,
} from "@/generated/prisma/client";

export type PageDTO = {
  id: string;
  name: string;
  slug: string;
  status: Page["status"];
  updatedAt: string;
  isPublished: boolean;
};

export function toPageDTO(page: Page): PageDTO {
  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    status: page.status,
    updatedAt: page.updatedAt.toISOString(),
    isPublished: page.publishedVersionId !== null,
  };
}

export type PersonalizationRuleDTO = {
  id: string;
  audienceId: string;
  audienceName: string;
  componentVariantId: string;
  content: Record<string, unknown>;
  priority: number;
};

export type ComponentDTO = {
  id: string;
  type: Component["type"];
  order: number;
  defaultContent: Record<string, unknown>;
  personalizationRules: PersonalizationRuleDTO[];
};

export function toComponentDTO(
  component: Component & {
    personalizationRules: (PersonalizationRule & {
      audience: { name: string };
      componentVariant: ComponentVariant;
    })[];
  },
): ComponentDTO {
  return {
    id: component.id,
    type: component.type,
    order: component.order,
    defaultContent: component.defaultContent as Record<string, unknown>,
    personalizationRules: component.personalizationRules.map((rule) => ({
      id: rule.id,
      audienceId: rule.audienceId,
      audienceName: rule.audience.name,
      componentVariantId: rule.componentVariantId,
      content: rule.componentVariant.content as Record<string, unknown>,
      priority: rule.priority,
    })),
  };
}

export type PageDetailDTO = PageDTO & {
  draftVersionId: string;
  components: ComponentDTO[];
};
