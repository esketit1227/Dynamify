import { effectiveBoundary } from "@/lib/sites/boundaries";
import type {
  Site,
  CrawledPage,
  ContentElement,
  WebsiteUnderstanding,
  ElementPersonalizationRule,
  ElementVariant,
  PersonalizationBoundary,
} from "@/generated/prisma/client";

export type SiteDTO = {
  id: string;
  url: string;
  status: Site["status"];
  errorMessage: string | null;
  ipEnrichmentEnabled: boolean;
  visitorTrackingEnabled: boolean;
  holdbackPercent: number;
  autoApproveAiContent: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toSiteDTO(site: Site): SiteDTO {
  return {
    id: site.id,
    url: site.url,
    status: site.status,
    errorMessage: site.errorMessage,
    ipEnrichmentEnabled: site.ipEnrichmentEnabled,
    visitorTrackingEnabled: site.visitorTrackingEnabled,
    holdbackPercent: site.holdbackPercent,
    autoApproveAiContent: site.autoApproveAiContent,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

export type ElementPersonalizationRuleDTO = {
  id: string;
  audienceId: string;
  audienceName: string;
  elementVariantId: string;
  content: string;
  priority: number;
  status: ElementPersonalizationRule["status"];
  method: ElementVariant["method"];
};

export type ContentElementDTO = {
  id: string;
  section: ContentElement["section"];
  elementType: ContentElement["elementType"];
  currentContent: string;
  selector: string;
  personalizationRules: ElementPersonalizationRuleDTO[];
  // The effective boundary (override if set, else the type default —
  // src/lib/sites/boundaries.ts), computed server-side so the client
  // never re-implements the default map. boundaryOverride is the raw
  // per-element override, null when this element is just using its
  // type's default (lets the UI show "using the default" vs. "you
  // changed this").
  boundary: PersonalizationBoundary;
  boundaryOverride: PersonalizationBoundary | null;
};

export type CrawledPageDTO = {
  id: string;
  url: string;
  title: string | null;
  elements: ContentElementDTO[];
};

export type WebsiteUnderstandingDTO = {
  companySummary: string;
  productSummary: string;
  targetCustomers: string;
  brandTone: unknown;
  valueProps: unknown;
  primaryCta: string | null;
  method: WebsiteUnderstanding["method"];
};

export type SiteDetailDTO = SiteDTO & {
  understanding: WebsiteUnderstandingDTO | null;
  pages: CrawledPageDTO[];
  pageCount: number;
  elementCount: number;
};

type ContentElementWithRules = ContentElement & {
  personalizationRules: (ElementPersonalizationRule & {
    audience: { name: string };
    elementVariant: ElementVariant;
  })[];
};

export function toSiteDetailDTO(
  site: Site & {
    understanding: WebsiteUnderstanding | null;
    pages: (CrawledPage & { elements: ContentElementWithRules[] })[];
  },
): SiteDetailDTO {
  const pages: CrawledPageDTO[] = site.pages.map((page) => ({
    id: page.id,
    url: page.url,
    title: page.title,
    elements: page.elements.map((el) => ({
      id: el.id,
      section: el.section,
      elementType: el.elementType,
      currentContent: el.currentContent,
      selector: el.selector,
      boundary: effectiveBoundary(el),
      boundaryOverride: el.personalizationBoundary,
      personalizationRules: el.personalizationRules.map((rule) => ({
        id: rule.id,
        audienceId: rule.audienceId,
        audienceName: rule.audience.name,
        elementVariantId: rule.elementVariantId,
        content: rule.elementVariant.content,
        priority: rule.priority,
        status: rule.status,
        method: rule.elementVariant.method,
      })),
    })),
  }));

  return {
    ...toSiteDTO(site),
    understanding: site.understanding
      ? {
          companySummary: site.understanding.companySummary,
          productSummary: site.understanding.productSummary,
          targetCustomers: site.understanding.targetCustomers,
          brandTone: site.understanding.brandTone,
          valueProps: site.understanding.valueProps,
          primaryCta: site.understanding.primaryCta,
          method: site.understanding.method,
        }
      : null,
    pages,
    pageCount: pages.length,
    elementCount: pages.reduce((sum, p) => sum + p.elements.length, 0),
  };
}
