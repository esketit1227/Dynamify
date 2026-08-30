import { prisma } from "@/lib/db";
import type { PageDefinition } from "@dynamify/personalization-sdk";

export type PublishedPage = {
  pageId: string;
  pageVersionId: string;
  organizationId: string;
  definition: PageDefinition;
};

// Public surface: only ever reads a page's currently published version.
// Draft/archived versions, internal ids beyond what the compiled definition
// already carries, and everything else about the org stay unreachable from
// here — the query itself makes that structural, not just a convention to
// remember (CLAUDE.md: "public page endpoints serve only the currently
// published version").
export async function getPublishedPageBySlug(slug: string): Promise<PublishedPage | null> {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      organizationId: true,
      publishedVersionId: true,
      publishedVersion: { select: { id: true, compiledContent: true } },
    },
  });

  if (!page || !page.publishedVersion || !page.publishedVersion.compiledContent) {
    return null;
  }

  return {
    pageId: page.id,
    pageVersionId: page.publishedVersion.id,
    organizationId: page.organizationId,
    definition: page.publishedVersion.compiledContent as unknown as PageDefinition,
  };
}
