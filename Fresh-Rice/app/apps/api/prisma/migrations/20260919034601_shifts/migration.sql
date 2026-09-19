-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startLat" DOUBLE PRECISION,
    "startLng" DOUBLE PRECISION,
    "endLat" DOUBLE PRECISION,
    "endLng" DOUBLE PRECISION,
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_userId_startedAt_idx" ON "Shift"("userId", "startedAt");
