-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT;

-- AlterTable
ALTER TABLE "RouteStop" ADD COLUMN     "eta" TIMESTAMP(3),
ADD COLUMN     "loadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderPaise" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountPaise" INTEGER,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "usesPerUser" INTEGER NOT NULL DEFAULT 1,
    "totalUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderLocation" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiderLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "RiderLocation_riderId_at_idx" ON "RiderLocation"("riderId", "at");
