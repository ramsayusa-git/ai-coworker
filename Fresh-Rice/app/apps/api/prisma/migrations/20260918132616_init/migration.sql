-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'B2B_USER', 'RIDER', 'OPS', 'ADMIN');

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('te', 'hi', 'en');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TWO_WHEELER', 'THREE_WHEELER', 'TEMPO');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('B2C', 'B2B', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'WALLET', 'COD', 'CREDIT', 'MANDATE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'TRIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'ARRIVED', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('GRN', 'SALE', 'RESERVE', 'RELEASE', 'DAMAGE', 'ADJUST');

-- CreateEnum
CREATE TYPE "PriceScope" AS ENUM ('BASE', 'ZONE', 'B2B_TIER');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('MILL', 'ADDON_SUPPLIER', 'PACKAGING', 'LOGISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "lang" "Lang" NOT NULL DEFAULT 'te',
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "b2bAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referralCode" TEXT,
    "referredById" TEXT,
    "walletBalance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Otp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincodes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "warehouseId" TEXT,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "line1" TEXT NOT NULL,
    "landmark" TEXT,
    "complex" TEXT,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "hasLift" BOOLEAN NOT NULL DEFAULT true,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "zoneId" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VendorType" NOT NULL DEFAULT 'MILL',
    "district" TEXT,
    "gstin" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "bankRef" TEXT,
    "termsDays" INTEGER NOT NULL DEFAULT 7,
    "rating" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorLedger" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "deltaPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref" TEXT,
    "poId" TEXT,
    "dueOn" TIMESTAMP(3),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "pincode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "newLotNo" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNo" SERIAL NOT NULL,
    "vendorId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedOn" TIMESTAMP(3),
    "notes" TEXT,
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "ratePaisePerKg" INTEGER NOT NULL,
    "receivedKg" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PoLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variety" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTe" TEXT,
    "description" TEXT,
    "isAddon" BOOLEAN NOT NULL DEFAULT false,
    "agedPreferred" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Variety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "packKg" DOUBLE PRECISION NOT NULL,
    "gstPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "scope" "PriceScope" NOT NULL DEFAULT 'BASE',
    "zoneId" TEXT,
    "b2bTier" INTEGER,
    "skuId" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "poId" TEXT,
    "vendorId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "harvestSeason" TEXT NOT NULL,
    "milledOn" TIMESTAMP(3) NOT NULL,
    "moisturePct" DOUBLE PRECISION NOT NULL,
    "brokenPct" DOUBLE PRECISION NOT NULL,
    "costPaisePerKg" INTEGER NOT NULL,
    "receivedKg" DOUBLE PRECISION NOT NULL,
    "onHandKg" DOUBLE PRECISION NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "skuId" TEXT,
    "kgDelta" DOUBLE PRECISION NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "creditLimitPaise" INTEGER NOT NULL DEFAULT 0,
    "termsDays" INTEGER NOT NULL DEFAULT 15,
    "onHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bLedger" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "deltaPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "dueOn" TIMESTAMP(3),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "frequency" "SubFrequency" NOT NULL,
    "nextRunOn" TIMESTAMP(3) NOT NULL,
    "status" "SubStatus" NOT NULL DEFAULT 'ACTIVE',
    "skipNext" BOOLEAN NOT NULL DEFAULT false,
    "mandateRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "b2bAccountId" TEXT,
    "addressId" TEXT NOT NULL,
    "slotId" TEXT,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "channel" "OrderChannel" NOT NULL DEFAULT 'B2C',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalPaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "deliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "totalKg" DOUBLE PRECISION NOT NULL,
    "idempotencyKey" TEXT,
    "subscriptionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "lotId" TEXT,
    "qty" INTEGER NOT NULL,
    "unitPaise" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deltaPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "zoneId" TEXT NOT NULL,
    "riderId" TEXT,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'THREE_WHEELER',
    "capacityKg" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "loadKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" "StopStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryOtp" TEXT,
    "otpVerified" BOOLEAN NOT NULL DEFAULT false,
    "podPhotoUrl" TEXT,
    "podLat" DOUBLE PRECISION,
    "podLng" DOUBLE PRECISION,
    "deliveredAt" TIMESTAMP(3),
    "failReason" TEXT,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "template" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "actor" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerGstin" TEXT,
    "buyerAddress" TEXT NOT NULL,
    "sellerGstin" TEXT NOT NULL DEFAULT '36XXXXX0000X1Z5',
    "fssaiNo" TEXT NOT NULL DEFAULT '13626000000000',
    "lines" JSONB NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "Otp_phone_idx" ON "Otp"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNo_key" ON "PurchaseOrder"("poNo");

-- CreateIndex
CREATE UNIQUE INDEX "Variety_code_key" ON "Variety"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lotNo_key" ON "Lot"("lotNo");

-- CreateIndex
CREATE INDEX "StockLedger_lotId_idx" ON "StockLedger"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_orderId_key" ON "RouteStop"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_b2bAccountId_fkey" FOREIGN KEY ("b2bAccountId") REFERENCES "B2bAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Otp" ADD CONSTRAINT "Otp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLedger" ADD CONSTRAINT "VendorLedger_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoLine" ADD CONSTRAINT "PoLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoLine" ADD CONSTRAINT "PoLine_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bLedger" ADD CONSTRAINT "B2bLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "B2bAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_b2bAccountId_fkey" FOREIGN KEY ("b2bAccountId") REFERENCES "B2bAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
