import type { PlatformConnection } from "@/generated/prisma/client";

// Never includes encryptedCredentials — CLAUDE.md: "never return whole
// database records," and a credential ciphertext has no legitimate reason
// to leave the server even encrypted.
export type PlatformConnectionDTO = {
  id: string;
  platform: PlatformConnection["platform"];
  externalStoreId: string;
  status: PlatformConnection["status"];
  createdAt: string;
  updatedAt: string;
};

export function toPlatformConnectionDTO(connection: PlatformConnection): PlatformConnectionDTO {
  return {
    id: connection.id,
    platform: connection.platform,
    externalStoreId: connection.externalStoreId,
    status: connection.status,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}
