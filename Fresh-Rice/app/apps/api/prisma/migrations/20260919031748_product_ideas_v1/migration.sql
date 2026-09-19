-- AlterTable
ALTER TABLE "User" ADD COLUMN     "householdSize" INTEGER;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "story" TEXT,
ADD COLUMN     "storyPhoto" TEXT,
ADD COLUMN     "storyTitle" TEXT;

-- CreateTable
CREATE TABLE "TraceScan" (
    "id" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "ua" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TraceScan_lotNo_at_idx" ON "TraceScan"("lotNo", "at");
