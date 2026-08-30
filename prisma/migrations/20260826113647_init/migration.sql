-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('HERO', 'TEXT', 'IMAGE', 'CTA', 'FEATURES', 'TESTIMONIALS', 'LOGOS', 'PRICING', 'FAQ', 'FORM');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IN', 'GREATER_THAN', 'LESS_THAN', 'EXISTS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageVersionId" TEXT NOT NULL,
    "type" "ComponentType" NOT NULL,
    "order" INTEGER NOT NULL,
    "defaultContent" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "name" TEXT,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audience" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "value" JSONB NOT NULL,
    "groupIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_organizationId_idx" ON "Page"("organizationId");

-- CreateIndex
CREATE INDEX "Page_projectId_idx" ON "Page"("projectId");

-- CreateIndex
CREATE INDEX "PageVersion_organizationId_idx" ON "PageVersion"("organizationId");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_idx" ON "PageVersion"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "PageVersion_pageId_versionNumber_key" ON "PageVersion"("pageId", "versionNumber");

-- CreateIndex
CREATE INDEX "Component_organizationId_idx" ON "Component"("organizationId");

-- CreateIndex
CREATE INDEX "Component_pageVersionId_idx" ON "Component"("pageVersionId");

-- CreateIndex
CREATE INDEX "ComponentVariant_organizationId_idx" ON "ComponentVariant"("organizationId");

-- CreateIndex
CREATE INDEX "ComponentVariant_componentId_idx" ON "ComponentVariant"("componentId");

-- CreateIndex
CREATE INDEX "Audience_organizationId_idx" ON "Audience"("organizationId");

-- CreateIndex
CREATE INDEX "AudienceRule_organizationId_idx" ON "AudienceRule"("organizationId");

-- CreateIndex
CREATE INDEX "AudienceRule_audienceId_idx" ON "AudienceRule"("audienceId");

-- CreateIndex
CREATE INDEX "PersonalizationRule_organizationId_idx" ON "PersonalizationRule"("organizationId");

-- CreateIndex
CREATE INDEX "PersonalizationRule_componentId_idx" ON "PersonalizationRule"("componentId");

-- CreateIndex
CREATE INDEX "PersonalizationRule_audienceId_idx" ON "PersonalizationRule"("audienceId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "PageVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentVariant" ADD CONSTRAINT "ComponentVariant_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audience" ADD CONSTRAINT "Audience_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceRule" ADD CONSTRAINT "AudienceRule_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationRule" ADD CONSTRAINT "PersonalizationRule_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationRule" ADD CONSTRAINT "PersonalizationRule_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationRule" ADD CONSTRAINT "PersonalizationRule_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ComponentVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
