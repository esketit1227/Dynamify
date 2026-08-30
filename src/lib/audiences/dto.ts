import type { Audience, AudienceRule } from "@/generated/prisma/client";

export type AudienceRuleDTO = {
  id: string;
  field: string;
  operator: AudienceRule["operator"];
  value: unknown;
  groupIndex: number;
};

export type AudienceDTO = {
  id: string;
  name: string;
  description: string | null;
  ruleCount: number;
  updatedAt: string;
};

export type AudienceDetailDTO = AudienceDTO & { rules: AudienceRuleDTO[] };

export function toAudienceDTO(audience: Audience & { _count: { rules: number } }): AudienceDTO {
  return {
    id: audience.id,
    name: audience.name,
    description: audience.description,
    ruleCount: audience._count.rules,
    updatedAt: audience.updatedAt.toISOString(),
  };
}

export function toAudienceDetailDTO(
  audience: Audience & { rules: AudienceRule[] },
): AudienceDetailDTO {
  return {
    id: audience.id,
    name: audience.name,
    description: audience.description,
    ruleCount: audience.rules.length,
    updatedAt: audience.updatedAt.toISOString(),
    rules: audience.rules.map((r) => ({
      id: r.id,
      field: r.field,
      operator: r.operator,
      value: r.value,
      groupIndex: r.groupIndex,
    })),
  };
}
