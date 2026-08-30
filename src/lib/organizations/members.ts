import { prisma } from "@/lib/db";

export type MemberDTO = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export async function listMembers(organizationId: string): Promise<MemberDTO[]> {
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
  }));
}
