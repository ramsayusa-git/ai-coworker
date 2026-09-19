-- CreateEnum
CREATE TYPE "ModType" AS ENUM ('ITEMS', 'SLOT', 'ADDRESS', 'DISCOUNT', 'NOTE');

-- CreateEnum
CREATE TYPE "ModStatus" AS ENUM ('APPLIED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "OrderModification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "ModType" NOT NULL,
    "status" "ModStatus" NOT NULL DEFAULT 'APPLIED',
    "before" JSONB,
    "after" JSONB,
    "amountPaise" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "issueId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderModification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderModification_orderId_idx" ON "OrderModification"("orderId");

-- CreateIndex
CREATE INDEX "OrderModification_status_idx" ON "OrderModification"("status");

-- AddForeignKey
ALTER TABLE "OrderModification" ADD CONSTRAINT "OrderModification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
