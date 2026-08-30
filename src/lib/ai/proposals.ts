import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/errors";
import { generateAudiences } from "@/lib/ai/generateAudiences";
import type { Prisma, AiProposal } from "@/generated/prisma/client";
import type { RuleOperator } from "@/generated/prisma/enums";

export class ProposalNotFoundError extends HttpError {
  constructor() {
    super(404, "Proposal not found");
  }
}

export class ProposalAlreadyReviewedError extends HttpError {
  constructor() {
    super(409, "This proposal was already reviewed");
  }
}

export type ProposalDTO = {
  id: string;
  kind: AiProposal["kind"];
  input: unknown;
  proposedContent: unknown;
  status: AiProposal["status"];
  createdAt: string;
};

function toDTO(proposal: AiProposal): ProposalDTO {
  return {
    id: proposal.id,
    kind: proposal.kind,
    input: proposal.input,
    proposedContent: proposal.proposedContent,
    status: proposal.status,
    createdAt: proposal.createdAt.toISOString(),
  };
}

export async function listProposals(organizationId: string): Promise<ProposalDTO[]> {
  const proposals = await prisma.aiProposal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return proposals.map(toDTO);
}

// AI never writes to Audience/Component directly — it only ever produces a
// PENDING proposal. Nothing here is visible anywhere else in the product
// until a human explicitly approves it.
export async function createAudienceProposal(
  organizationId: string,
  businessDescription: string,
): Promise<ProposalDTO> {
  const generated = await generateAudiences(businessDescription);

  const proposal = await prisma.aiProposal.create({
    data: {
      organizationId,
      kind: "AUDIENCE",
      input: { businessDescription } as Prisma.InputJsonValue,
      proposedContent: generated as unknown as Prisma.InputJsonValue,
    },
  });
  return toDTO(proposal);
}

async function getPendingProposal(organizationId: string, proposalId: string) {
  const proposal = await prisma.aiProposal.findFirst({
    where: { id: proposalId, organizationId },
  });
  if (!proposal) throw new ProposalNotFoundError();
  if (proposal.status !== "PENDING") throw new ProposalAlreadyReviewedError();
  return proposal;
}

export async function approveProposal(organizationId: string, proposalId: string): Promise<void> {
  const proposal = await getPendingProposal(organizationId, proposalId);

  if (proposal.kind === "AUDIENCE") {
    const content = proposal.proposedContent as { audiences: Array<{
      name: string;
      description: string;
      rules: Array<{ field: string; operator: string; value: unknown; groupIndex: number }>;
    }> };

    await prisma.$transaction(
      content.audiences.map((audience) =>
        prisma.audience.create({
          data: {
            organizationId,
            name: audience.name,
            description: audience.description,
            rules: {
              create: audience.rules.map((rule) => ({
                organizationId,
                field: rule.field,
                // Validated against the RuleOperator enum by Zod at generation
                // time (generateAudiencesOutputSchema) — safe to assert here.
                operator: rule.operator as RuleOperator,
                value: rule.value as Prisma.InputJsonValue,
                groupIndex: rule.groupIndex ?? 0,
              })),
            },
          },
        }),
      ),
    );
  }

  await prisma.aiProposal.update({
    where: { id: proposal.id },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });
}

export async function rejectProposal(organizationId: string, proposalId: string): Promise<void> {
  const proposal = await getPendingProposal(organizationId, proposalId);
  await prisma.aiProposal.update({
    where: { id: proposal.id },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
}
