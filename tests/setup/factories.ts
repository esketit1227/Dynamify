import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/generated/prisma/enums";

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createOrgWithUser(role: Role = "OWNER") {
  const organization = await prisma.organization.create({
    data: { name: unique("Org"), slug: unique("org") },
  });

  const user = await prisma.user.create({
    data: {
      email: `${unique("user")}@example.com`,
      passwordHash: await hashPassword("test-password-123"),
    },
  });

  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role },
  });

  return { organization, user };
}

export async function createPage(organizationId: string) {
  const project = await prisma.project.create({
    data: { organizationId, name: unique("Project"), slug: unique("project") },
  });

  return prisma.page.create({
    data: {
      organizationId,
      projectId: project.id,
      name: unique("Page"),
      slug: unique("page"),
    },
  });
}
