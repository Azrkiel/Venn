ALTER TABLE "AvailabilityResponse"
  ADD COLUMN "avatarId" TEXT,
  ADD COLUMN "photo" BYTEA,
  ADD COLUMN "photoKey" TEXT;

CREATE UNIQUE INDEX "AvailabilityResponse_photoKey_key" ON "AvailabilityResponse"("photoKey");
