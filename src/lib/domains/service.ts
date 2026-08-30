import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";

export class DomainNotFoundError extends HttpError {
  constructor() {
    super(404, "Domain not found");
  }
}

export class HostnameInUseError extends HttpError {
  constructor() {
    super(409, "That hostname is already registered");
  }
}

export type DomainDTO = {
  id: string;
  hostname: string;
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
};

function toDTO(domain: {
  id: string;
  hostname: string;
  verificationToken: string;
  verifiedAt: Date | null;
  createdAt: Date;
}): DomainDTO {
  return {
    id: domain.id,
    hostname: domain.hostname,
    verificationToken: domain.verificationToken,
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
  };
}

export async function listDomains(organizationId: string): Promise<DomainDTO[]> {
  const domains = await prisma.domain.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return domains.map(toDTO);
}

export async function addDomain(organizationId: string, hostname: string): Promise<DomainDTO> {
  const existing = await prisma.domain.findUnique({ where: { hostname } });
  if (existing) throw new HostnameInUseError();

  const verificationToken = `dynamify-verify-${randomBytes(16).toString("hex")}`;
  const domain = await prisma.domain.create({
    data: { organizationId, hostname, verificationToken },
  });
  return toDTO(domain);
}

// Real DNS verification: checks for a TXT record at the domain matching the
// issued token. Genuinely functional — there's just no real domain in this
// dev environment to point DNS at and verify against.
export async function verifyDomain(organizationId: string, domainId: string): Promise<DomainDTO> {
  const domain = await prisma.domain.findFirst({ where: { id: domainId, organizationId } });
  if (!domain) throw new DomainNotFoundError();

  let verified = false;
  try {
    const records = await resolveTxt(domain.hostname);
    verified = records.some((record) => record.join("").includes(domain.verificationToken));
  } catch {
    verified = false; // NXDOMAIN, no TXT record, resolver failure — all just "not verified yet"
  }

  const updated = await prisma.domain.update({
    where: { id: domainId },
    data: { verifiedAt: verified ? new Date() : null },
  });
  return toDTO(updated);
}

export async function deleteDomain(organizationId: string, domainId: string): Promise<void> {
  const domain = await prisma.domain.findFirst({ where: { id: domainId, organizationId } });
  if (!domain) throw new DomainNotFoundError();
  await prisma.domain.delete({ where: { id: domainId } });
}
