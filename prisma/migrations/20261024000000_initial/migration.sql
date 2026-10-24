-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "CalendarGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedAccess" TEXT NOT NULL,
    "encryptedRefresh" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "refreshLockUntil" TIMESTAMP(3),

    CONSTRAINT "CalendarGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectedCalendar" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "writable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SelectedCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitedPerson" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "InvitedPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingRequest" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requesterMemberId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ready',
    "slotVersion" INTEGER NOT NULL DEFAULT 1,
    "selectedSlotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deliveryState" TEXT NOT NULL DEFAULT 'not_requested',

    CONSTRAINT "SchedulingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestParticipant" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "RequestParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "freeIds" TEXT[],
    "busyIds" TEXT[],
    "unknownIds" TEXT[],

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareGrant" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ShareGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "guestName" TEXT,
    "isGuest" BOOLEAN NOT NULL,
    "choice" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerSender" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,

    CONSTRAINT "PhoneLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairingChallenge" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "codeDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairingChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "stateDigest" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedVerifier" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'calendar',
    "requestId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "requestId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "htmlLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionNotice" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "slotVersion" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "CompletionNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarGrant_userId_key" ON "CalendarGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SelectedCalendar_grantId_calendarId_key" ON "SelectedCalendar"("grantId", "calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_groupId_userId_key" ON "Membership"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenDigest_key" ON "Invite"("tokenDigest");

-- CreateIndex
CREATE INDEX "SchedulingRequest_ownerId_createdAt_idx" ON "SchedulingRequest"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "SchedulingRequest_expiresAt_idx" ON "SchedulingRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestParticipant_requestId_participantId_key" ON "RequestParticipant"("requestId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_requestId_ordinal_key" ON "Slot"("requestId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ShareGrant_tokenDigest_key" ON "ShareGrant"("tokenDigest");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_requestId_voterKey_slotId_key" ON "Vote"("requestId", "voterKey", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_tokenDigest_key" ON "DeviceToken"("tokenDigest");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneLink_userId_key" ON "PhoneLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneLink_providerSender_key" ON "PhoneLink"("providerSender");

-- CreateIndex
CREATE UNIQUE INDEX "PairingChallenge_codeDigest_key" ON "PairingChallenge"("codeDigest");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_stateDigest_key" ON "OAuthState"("stateDigest");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedDelivery_projectId_messageId_key" ON "ProcessedDelivery"("projectId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAction_requestId_key" ON "EventAction"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAction_eventId_key" ON "EventAction"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAction_ownerId_requestId_key" ON "EventAction"("ownerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionNotice_requestId_slotVersion_key" ON "CompletionNotice"("requestId", "slotVersion");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarGrant" ADD CONSTRAINT "CalendarGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedCalendar" ADD CONSTRAINT "SelectedCalendar_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CalendarGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitedPerson" ADD CONSTRAINT "InvitedPerson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRequest" ADD CONSTRAINT "SchedulingRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRequest" ADD CONSTRAINT "SchedulingRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestParticipant" ADD CONSTRAINT "RequestParticipant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchedulingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchedulingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareGrant" ADD CONSTRAINT "ShareGrant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchedulingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchedulingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneLink" ADD CONSTRAINT "PhoneLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingChallenge" ADD CONSTRAINT "PairingChallenge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAction" ADD CONSTRAINT "EventAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchedulingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionNotice" ADD CONSTRAINT "CompletionNotice_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SchedulingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

