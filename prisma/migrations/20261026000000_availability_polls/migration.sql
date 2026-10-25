CREATE TABLE "AvailabilityPoll" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "scale" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "noticeState" TEXT NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvailabilityPoll_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AvailabilityPoll_scale_check" CHECK ("scale" IN ('day', 'week', 'fortnight', 'month', 'months', 'year')),
    CONSTRAINT "AvailabilityPoll_date_order_check" CHECK ("startDate" <= "endDate"),
    CONSTRAINT "AvailabilityPoll_retention_check" CHECK ("expiresAt" > "closesAt" OR "closedAt" IS NOT NULL)
);

CREATE TABLE "AvailabilityResponse" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ranges" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvailabilityResponse_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AvailabilityResponse_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 40),
    CONSTRAINT "AvailabilityResponse_ranges_check" CHECK (jsonb_typeof("ranges") = 'array')
);

CREATE UNIQUE INDEX "AvailabilityPoll_tokenDigest_key" ON "AvailabilityPoll"("tokenDigest");
CREATE INDEX "AvailabilityPoll_ownerId_createdAt_idx" ON "AvailabilityPoll"("ownerId", "createdAt");
CREATE INDEX "AvailabilityPoll_noticeState_closesAt_idx" ON "AvailabilityPoll"("noticeState", "closesAt");
CREATE INDEX "AvailabilityPoll_expiresAt_idx" ON "AvailabilityPoll"("expiresAt");
CREATE UNIQUE INDEX "AvailabilityResponse_pollId_voterKey_key" ON "AvailabilityResponse"("pollId", "voterKey");
ALTER TABLE "AvailabilityPoll" ADD CONSTRAINT "AvailabilityPoll_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityResponse" ADD CONSTRAINT "AvailabilityResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "AvailabilityPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
