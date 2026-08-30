import { prisma } from "@/lib/db";

// Phase 2 doesn't expose project management UI (roadmap scopes that later);
// every org gets one implicit default project that pages are filed under.
export async function getOrCreateDefaultProject(organizationId: string) {
  const existing = await prisma.project.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.project.create({
    data: { organizationId, name: "Default", slug: "default" },
  });
}
