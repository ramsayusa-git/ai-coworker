-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('OWNED', 'HIRED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HireBasis" AS ENUM ('PER_DAY', 'PER_MONTH', 'PER_TRIP', 'PER_KM');

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "vehicleId" TEXT;

-- CreateTable
CREATE TABLE "VehicleVendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "bankNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleVendorLedger" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "deltaPaise" INTEGER NOT NULL,
    "vehicleId" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "method" TEXT,
    "ref" TEXT,
    "note" TEXT,
    "byUserId" TEXT,

    CONSTRAINT "VehicleVendorLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "regNo" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'THREE_WHEELER',
    "ownership" "VehicleOwnership" NOT NULL DEFAULT 'OWNED',
    "vendorId" TEXT,
    "make" TEXT,
    "model" TEXT,
    "capacityKg" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "fuelType" TEXT NOT NULL DEFAULT 'PETROL',
    "hireRatePaise" INTEGER NOT NULL DEFAULT 0,
    "hireBasis" "HireBasis" NOT NULL DEFAULT 'PER_MONTH',
    "assignedRiderId" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "odometerKm" INTEGER NOT NULL DEFAULT 0,
    "insuranceExpiry" TIMESTAMP(3),
    "pucExpiry" TIMESTAMP(3),
    "fitnessExpiry" TIMESTAMP(3),
    "permitExpiry" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountPaise" INTEGER NOT NULL DEFAULT 0,
    "odometerKm" INTEGER,
    "litres" DOUBLE PRECISION,
    "vendorName" TEXT,
    "description" TEXT,
    "photo" TEXT,
    "byUserId" TEXT,
    "nextDueKm" INTEGER,
    "nextDueOn" TIMESTAMP(3),

    CONSTRAINT "VehicleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCheck" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "routeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometerStart" INTEGER,
    "odometerEnd" INTEGER,
    "checklist" JSONB NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "issues" TEXT,

    CONSTRAINT "TripCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleVendorLedger_vendorId_date_idx" ON "VehicleVendorLedger"("vendorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_regNo_key" ON "Vehicle"("regNo");

-- CreateIndex
CREATE INDEX "VehicleLog_vehicleId_date_idx" ON "VehicleLog"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "TripCheck_vehicleId_date_idx" ON "TripCheck"("vehicleId", "date");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleVendorLedger" ADD CONSTRAINT "VehicleVendorLedger_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VehicleVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VehicleVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleLog" ADD CONSTRAINT "VehicleLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCheck" ADD CONSTRAINT "TripCheck_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
