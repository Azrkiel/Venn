-- AlterTable
ALTER TABLE "SchedulingRequest" ALTER COLUMN "groupId" DROP NOT NULL,
ALTER COLUMN "requesterMemberId" DROP NOT NULL;
