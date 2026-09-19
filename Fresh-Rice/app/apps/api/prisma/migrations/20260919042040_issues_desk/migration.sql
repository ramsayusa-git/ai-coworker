-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "ticketNo" SERIAL NOT NULL,
    "raisedById" TEXT NOT NULL,
    "orderId" TEXT,
    "category" TEXT NOT NULL,
    "priority" "IssuePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "photo" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'app',
    "assigneeId" TEXT,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueMessage" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "photo" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "viaWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Issue_ticketNo_key" ON "Issue"("ticketNo");

-- CreateIndex
CREATE INDEX "Issue_status_priority_slaDueAt_idx" ON "Issue"("status", "priority", "slaDueAt");

-- CreateIndex
CREATE INDEX "Issue_raisedById_idx" ON "Issue"("raisedById");

-- CreateIndex
CREATE INDEX "IssueMessage_issueId_createdAt_idx" ON "IssueMessage"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueMessage" ADD CONSTRAINT "IssueMessage_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueMessage" ADD CONSTRAINT "IssueMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
