-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'B2C',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "brandName" TEXT NOT NULL DEFAULT 'FreshRice',
    "legalName" TEXT NOT NULL DEFAULT 'Aetos Tech Labs',
    "address" TEXT NOT NULL DEFAULT 'Kukatpally, Hyderabad 500072',
    "gstin" TEXT NOT NULL DEFAULT '36XXXXX0000X1Z5',
    "fssai" TEXT NOT NULL DEFAULT '13626000000000',
    "phone" TEXT,
    "email" TEXT,
    "logo" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#1d5133',
    "footer" TEXT NOT NULL DEFAULT 'Rice is a pre-packed & labelled commodity taxed at 5% GST. Store in a cool, dry place. Milling date and lot printed on each bag.',
    "terms" TEXT,
    "bankDetails" TEXT,
    "signatory" TEXT,
    "showLot" BOOLEAN NOT NULL DEFAULT true,
    "numberPrefix" TEXT NOT NULL DEFAULT 'FR',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);
