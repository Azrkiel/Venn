CREATE TABLE "ProviderCalendarGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedAccess" TEXT NOT NULL,
    "encryptedRefresh" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "refreshLockUntil" TIMESTAMP(3),
    CONSTRAINT "ProviderCalendarGrant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProviderCalendar" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProviderCalendar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderCalendarGrant_userId_provider_key" ON "ProviderCalendarGrant"("userId", "provider");
CREATE UNIQUE INDEX "ProviderCalendar_grantId_calendarId_key" ON "ProviderCalendar"("grantId", "calendarId");
ALTER TABLE "ProviderCalendarGrant" ADD CONSTRAINT "ProviderCalendarGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderCalendar" ADD CONSTRAINT "ProviderCalendar_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "ProviderCalendarGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
