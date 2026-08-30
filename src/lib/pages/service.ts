import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { getOrCreateDefaultProject } from "@/lib/projects/service";
import { mapToDefinition } from "@/lib/personalization/mapToDefinition";
import {
  toPageDTO,
  toComponentDTO,
  type PageDTO,
  type PageDetailDTO,
} from "@/lib/pages/dto";
import type { CreatePageInput, AddComponentInput, UpdateComponentInput } from "@/lib/validation/pages";
import type { Prisma } from "@/generated/prisma/client";

export class PageNotFoundError extends HttpError {
  constructor() {
    super(404, "Page not found");
  }
}

export class ComponentNotFoundError extends HttpError {
  constructor() {
    super(404, "Component not found");
  }
}

export class SlugInUseError extends HttpError {
  constructor() {
    super(409, "That slug is already taken");
  }
}

const componentWithRelations = {
  personalizationRules: {
    include: { audience: { select: { name: true } }, componentVariant: true },
  },
} satisfies Prisma.ComponentInclude;

export async function listPages(organizationId: string): Promise<PageDTO[]> {
  const pages = await prisma.page.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });
  return pages.map(toPageDTO);
}

export async function createPage(organizationId: string, input: CreatePageInput): Promise<PageDTO> {
  const existing = await prisma.page.findUnique({ where: { slug: input.slug } });
  if (existing) throw new SlugInUseError();

  const project = await getOrCreateDefaultProject(organizationId);

  const page = await prisma.$transaction(async (tx) => {
    const created = await tx.page.create({
      data: { organizationId, projectId: project.id, name: input.name, slug: input.slug },
    });
    await tx.pageVersion.create({
      data: { organizationId, pageId: created.id, versionNumber: 1 },
    });
    return created;
  });

  return toPageDTO(page);
}

// Every page has at most one mutable "draft" PageVersion at a time — the
// latest version with no publishedAt. If the latest version is already
// published, editing starts a new draft seeded from what's live, so the
// published version is never mutated out from under visitors mid-request.
async function getOrCreateDraftVersionId(organizationId: string, pageId: string): Promise<string> {
  const latest = await prisma.pageVersion.findFirst({
    where: { organizationId, pageId },
    orderBy: { versionNumber: "desc" },
    include: { components: { include: { variants: true, personalizationRules: true } } },
  });

  if (latest && latest.publishedAt === null) return latest.id;

  return prisma.$transaction(async (tx) => {
    const draft = await tx.pageVersion.create({
      data: {
        organizationId,
        pageId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
      },
    });

    if (latest) {
      for (const component of latest.components) {
        const newComponent = await tx.component.create({
          data: {
            organizationId,
            pageVersionId: draft.id,
            type: component.type,
            order: component.order,
            defaultContent: component.defaultContent as Prisma.InputJsonValue,
          },
        });

        const variantIdMap = new Map<string, string>();
        for (const variant of component.variants) {
          const newVariant = await tx.componentVariant.create({
            data: {
              organizationId,
              componentId: newComponent.id,
              name: variant.name,
              content: variant.content as Prisma.InputJsonValue,
            },
          });
          variantIdMap.set(variant.id, newVariant.id);
        }

        for (const rule of component.personalizationRules) {
          const newVariantId = variantIdMap.get(rule.componentVariantId);
          if (!newVariantId) continue; // defensive — shouldn't happen
          await tx.personalizationRule.create({
            data: {
              organizationId,
              componentId: newComponent.id,
              audienceId: rule.audienceId,
              componentVariantId: newVariantId,
              priority: rule.priority,
            },
          });
        }
      }
    }

    return draft.id;
  });
}

export async function getPageDetail(organizationId: string, pageId: string): Promise<PageDetailDTO> {
  const page = await prisma.page.findFirst({ where: { id: pageId, organizationId } });
  if (!page) throw new PageNotFoundError();

  const draftVersionId = await getOrCreateDraftVersionId(organizationId, pageId);

  const components = await prisma.component.findMany({
    where: { pageVersionId: draftVersionId },
    include: componentWithRelations,
    orderBy: { order: "asc" },
  });

  return {
    ...toPageDTO(page),
    draftVersionId,
    components: components.map(toComponentDTO),
  };
}

export async function addComponent(
  organizationId: string,
  pageId: string,
  input: AddComponentInput,
) {
  const page = await prisma.page.findFirst({ where: { id: pageId, organizationId } });
  if (!page) throw new PageNotFoundError();

  const draftVersionId = await getOrCreateDraftVersionId(organizationId, pageId);
  const count = await prisma.component.count({ where: { pageVersionId: draftVersionId } });

  const component = await prisma.component.create({
    data: {
      organizationId,
      pageVersionId: draftVersionId,
      type: input.type,
      order: count,
      defaultContent: input.defaultContent as Prisma.InputJsonValue,
    },
    include: componentWithRelations,
  });

  return toComponentDTO(component);
}

export async function updateComponent(
  organizationId: string,
  componentId: string,
  input: UpdateComponentInput,
) {
  const existing = await prisma.component.findFirst({
    where: { id: componentId, organizationId },
  });
  if (!existing) throw new ComponentNotFoundError();

  const component = await prisma.component.update({
    where: { id: componentId },
    data: { defaultContent: input.defaultContent as Prisma.InputJsonValue },
    include: componentWithRelations,
  });

  return toComponentDTO(component);
}

export async function deleteComponent(organizationId: string, componentId: string): Promise<void> {
  const existing = await prisma.component.findFirst({
    where: { id: componentId, organizationId },
  });
  if (!existing) throw new ComponentNotFoundError();

  await prisma.component.delete({ where: { id: componentId } });
}

// Publishing is atomic: compile the draft into a PageDefinition, write it to
// PageVersion.compiledContent, and swap Page.publishedVersionId — one
// transaction, per D6 / CLAUDE.md's "publishing is atomic."
export async function publishPage(organizationId: string, pageId: string): Promise<PageDTO> {
  const page = await prisma.page.findFirst({ where: { id: pageId, organizationId } });
  if (!page) throw new PageNotFoundError();

  const draftVersionId = await getOrCreateDraftVersionId(organizationId, pageId);

  const [components, audiences] = await Promise.all([
    prisma.component.findMany({
      where: { pageVersionId: draftVersionId },
      include: { variants: true, personalizationRules: true },
      orderBy: { order: "asc" },
    }),
    prisma.audience.findMany({ where: { organizationId }, include: { rules: true } }),
  ]);

  const definition = mapToDefinition({ pageId: page.id, components, audiences });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.pageVersion.update({
      where: { id: draftVersionId },
      data: {
        publishedAt: new Date(),
        compiledContent: definition as unknown as Prisma.InputJsonValue,
      },
    });

    return tx.page.update({
      where: { id: pageId },
      data: { status: "PUBLISHED", publishedVersionId: draftVersionId },
    });
  });

  return toPageDTO(updated);
}
