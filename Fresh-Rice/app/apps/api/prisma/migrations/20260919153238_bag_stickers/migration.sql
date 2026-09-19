-- CreateEnum
CREATE TYPE "StickerStatus" AS ENUM ('PRINTED', 'APPLIED', 'VOID');

-- CreateTable
CREATE TABLE "StickerBatch" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "packKg" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "StickerBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BagSticker" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "packKg" INTEGER NOT NULL,
    "serial" INTEGER NOT NULL,
    "status" "StickerStatus" NOT NULL DEFAULT 'PRINTED',
    "appliedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "firstScanAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BagSticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StickerBatch_lotId_createdAt_idx" ON "StickerBatch"("lotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BagSticker_code_key" ON "BagSticker"("code");

-- CreateIndex
CREATE INDEX "BagSticker_lotId_status_idx" ON "BagSticker"("lotId", "status");

-- CreateIndex
CREATE INDEX "BagSticker_batchId_serial_idx" ON "BagSticker"("batchId", "serial");

-- AddForeignKey
ALTER TABLE "StickerBatch" ADD CONSTRAINT "StickerBatch_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BagSticker" ADD CONSTRAINT "BagSticker_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StickerBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BagSticker" ADD CONSTRAINT "BagSticker_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
