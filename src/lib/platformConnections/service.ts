import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { encryptSecret } from "@/lib/security/encryption";
import { toPlatformConnectionDTO, type PlatformConnectionDTO } from "./dto";
import type { PlatformAdapter } from "@/adapters/types";

// Ecommerce foundation (docs/ecommerce.md) — org-scoped storage for "we
// have a connection to a store," nothing about its catalogue. No route or
// dashboard UI wired to this yet: no real PlatformAdapter exists to pick
// (Shopify/WooCommerce/Squarespace are all unbuilt), and wiring a route
// ahead of having anything real to call would just be dead surface area.
// The adapter is passed in by the caller rather than looked up from a
// registry, exactly so that decision — which real adapter a request
// resolves to — stays with whoever builds the first one, not preempted
// here.

export class PlatformConnectionNotFoundError extends HttpError {
  constructor() {
    super(404, "Platform connection not found");
  }
}

export class StoreAlreadyConnectedError extends HttpError {
  constructor() {
    super(409, "That store is already connected to a Dynamify organization");
  }
}

export async function listPlatformConnections(organizationId: string): Promise<PlatformConnectionDTO[]> {
  const connections = await prisma.platformConnection.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return connections.map(toPlatformConnectionDTO);
}

// Same global-uniqueness posture as Domain.hostname: one real store
// connects to one Dynamify organization at a time, checked before any row
// is written. A failed adapter.connect() (bad credentials, network
// failure) creates no row at all — there's no PENDING/FAILED state to
// leave behind (see the status enum's own comment in schema.prisma).
export async function connectPlatform(
  organizationId: string,
  adapter: PlatformAdapter,
  input: Record<string, string>,
): Promise<PlatformConnectionDTO> {
  const { externalStoreId, credentials } = await adapter.connect(input);

  const existing = await prisma.platformConnection.findUnique({
    where: { platform_externalStoreId: { platform: adapter.platform, externalStoreId } },
  });
  if (existing) throw new StoreAlreadyConnectedError();

  const connection = await prisma.platformConnection.create({
    data: {
      organizationId,
      platform: adapter.platform,
      externalStoreId,
      status: "CONNECTED",
      encryptedCredentials: encryptSecret(JSON.stringify(credentials)),
    },
  });
  return toPlatformConnectionDTO(connection);
}

// Clears the stored credential rather than just flipping status — no
// reason to keep a merchant's API credential around once disconnected.
export async function disconnectPlatform(
  organizationId: string,
  connectionId: string,
): Promise<PlatformConnectionDTO> {
  const connection = await prisma.platformConnection.findFirst({
    where: { id: connectionId, organizationId },
  });
  if (!connection) throw new PlatformConnectionNotFoundError();

  const updated = await prisma.platformConnection.update({
    where: { id: connectionId },
    data: { status: "DISCONNECTED", encryptedCredentials: null },
  });
  return toPlatformConnectionDTO(updated);
}
