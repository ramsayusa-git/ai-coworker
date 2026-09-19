-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- DropIndex
DROP INDEX "Invoice_orderId_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "supersedesId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_orderId_status_idx" ON "Invoice"("orderId", "status");
