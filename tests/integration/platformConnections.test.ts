import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  listPlatformConnections,
  connectPlatform,
  disconnectPlatform,
  StoreAlreadyConnectedError,
  PlatformConnectionNotFoundError,
} from "@/lib/platformConnections/service";
import { decryptSecret } from "@/lib/security/encryption";
import { resetDb } from "../setup/reset";
import { createOrgWithUser } from "../setup/factories";
import type { PlatformAdapter } from "@/adapters/types";

// A fake, in-memory adapter — proves the PlatformAdapter contract is real
// and testable without any actual Shopify/WooCommerce/Squarespace account
// (none exist yet; see docs/ecommerce.md). This is exactly the "mock
// adapter" the foundation work was scoped around.
function mockAdapter(overrides?: Partial<PlatformAdapter>): PlatformAdapter {
  return {
    platform: "SHOPIFY",
    connect: async (input) => ({
      externalStoreId: input.shop ?? "test-store.myshopify.com",
      credentials: { apiKey: "fake-api-key", apiSecret: "fake-api-secret" },
    }),
    fetchCatalogueSnapshot: async () => [],
    ...overrides,
  };
}

// PLATFORM_CREDENTIALS_ENCRYPTION_KEY is set globally in
// tests/setup/env.ts (before @/lib/env's module-load-time parse).

afterEach(async () => {
  await resetDb();
});

describe("connectPlatform", () => {
  it("stores a connection with credentials encrypted, not plaintext", async () => {
    const { organization } = await createOrgWithUser();

    await connectPlatform(organization.id, mockAdapter(), { shop: "acme.myshopify.com" });

    const row = await prisma.platformConnection.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    expect(row.externalStoreId).toBe("acme.myshopify.com");
    expect(row.status).toBe("CONNECTED");
    expect(row.encryptedCredentials).not.toContain("fake-api-key");
    expect(row.encryptedCredentials).not.toContain("fake-api-secret");
    expect(JSON.parse(decryptSecret(row.encryptedCredentials!))).toEqual({
      apiKey: "fake-api-key",
      apiSecret: "fake-api-secret",
    });
  });

  it("never includes credentials in the returned DTO", async () => {
    const { organization } = await createOrgWithUser();

    const connection = await connectPlatform(organization.id, mockAdapter(), { shop: "acme.myshopify.com" });

    expect(connection).not.toHaveProperty("encryptedCredentials");
    expect(connection).not.toHaveProperty("credentials");
    expect(JSON.stringify(connection)).not.toContain("fake-api-key");
  });

  it("rejects connecting the same store twice, even across organizations", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    await connectPlatform(orgA.id, mockAdapter(), { shop: "acme.myshopify.com" });

    await expect(
      connectPlatform(orgB.id, mockAdapter(), { shop: "acme.myshopify.com" }),
    ).rejects.toThrow(StoreAlreadyConnectedError);
  });

  it("creates no row at all when the adapter's connect() fails", async () => {
    const { organization } = await createOrgWithUser();
    const failingAdapter = mockAdapter({
      connect: async () => {
        throw new Error("invalid credentials");
      },
    });

    await expect(connectPlatform(organization.id, failingAdapter, {})).rejects.toThrow();

    const rows = await prisma.platformConnection.findMany({ where: { organizationId: organization.id } });
    expect(rows).toEqual([]);
  });
});

describe("listPlatformConnections", () => {
  it("never returns another organization's connections", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();

    await connectPlatform(orgA.id, mockAdapter(), { shop: "a-store.myshopify.com" });
    await connectPlatform(orgB.id, mockAdapter(), { shop: "b-store.myshopify.com" });

    const connectionsForA = await listPlatformConnections(orgA.id);
    expect(connectionsForA).toHaveLength(1);
    expect(connectionsForA[0].externalStoreId).toBe("a-store.myshopify.com");
  });
});

describe("disconnectPlatform", () => {
  it("flips status to DISCONNECTED and clears the stored credential", async () => {
    const { organization } = await createOrgWithUser();
    const connection = await connectPlatform(organization.id, mockAdapter(), { shop: "acme.myshopify.com" });

    const disconnected = await disconnectPlatform(organization.id, connection.id);

    expect(disconnected.status).toBe("DISCONNECTED");
    const row = await prisma.platformConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(row.encryptedCredentials).toBeNull();
  });

  it("throws for a connection that belongs to a different organization", async () => {
    const { organization: orgA } = await createOrgWithUser();
    const { organization: orgB } = await createOrgWithUser();
    const connection = await connectPlatform(orgA.id, mockAdapter(), { shop: "acme.myshopify.com" });

    await expect(disconnectPlatform(orgB.id, connection.id)).rejects.toThrow(PlatformConnectionNotFoundError);
  });
});
