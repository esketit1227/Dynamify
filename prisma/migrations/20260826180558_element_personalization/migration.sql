-- CreateTable
CREATE TABLE "ElementVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentElementId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementPersonalizationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentElementId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "elementVariantId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementPersonalizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElementVariant_organizationId_idx" ON "ElementVariant"("organizationId");

-- CreateIndex
CREATE INDEX "ElementVariant_contentElementId_idx" ON "ElementVariant"("contentElementId");

-- CreateIndex
CREATE INDEX "ElementPersonalizationRule_organizationId_idx" ON "ElementPersonalizationRule"("organizationId");

-- CreateIndex
CREATE INDEX "ElementPersonalizationRule_contentElementId_idx" ON "ElementPersonalizationRule"("contentElementId");

-- CreateIndex
CREATE INDEX "ElementPersonalizationRule_audienceId_idx" ON "ElementPersonalizationRule"("audienceId");

-- AddForeignKey
ALTER TABLE "ElementVariant" ADD CONSTRAINT "ElementVariant_contentElementId_fkey" FOREIGN KEY ("contentElementId") REFERENCES "ContentElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementPersonalizationRule" ADD CONSTRAINT "ElementPersonalizationRule_contentElementId_fkey" FOREIGN KEY ("contentElementId") REFERENCES "ContentElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementPersonalizationRule" ADD CONSTRAINT "ElementPersonalizationRule_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementPersonalizationRule" ADD CONSTRAINT "ElementPersonalizationRule_elementVariantId_fkey" FOREIGN KEY ("elementVariantId") REFERENCES "ElementVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

