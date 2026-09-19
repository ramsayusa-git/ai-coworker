-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "geoOk" BOOLEAN,
ADD COLUMN     "lateMin" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'app';

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "geofenceM" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "designation" TEXT,
    "joinedOn" TIMESTAMP(3),
    "monthlySalaryPaise" INTEGER NOT NULL DEFAULT 0,
    "weeklyOffs" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "shiftStart" TEXT NOT NULL DEFAULT '09:00',
    "shiftEnd" TEXT NOT NULL DEFAULT '18:00',
    "managerId" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "claimedIn" TIMESTAMP(3),
    "claimedOut" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roster" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_employeeCode_key" ON "StaffProfile"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_from_idx" ON "LeaveRequest"("userId", "from");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Roster_userId_date_key" ON "Roster"("userId", "date");
