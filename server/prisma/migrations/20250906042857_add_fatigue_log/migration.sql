-- CreateEnum
CREATE TYPE "prisma_20250824c"."FatigueType" AS ENUM ('BEFORE_SLEEP', 'AFTER_SLEEP', 'DAYTIME');

-- CreateTable
CREATE TABLE "prisma_20250824c"."FatigueLog" (
    "id" STRING NOT NULL,
    "username" STRING NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "prisma_20250824c"."FatigueType" NOT NULL,
    "value" INT4 NOT NULL,
    "note" STRING,
    "sleepLogUsername" STRING,
    "sleepLogDate" STRING,

    CONSTRAINT "FatigueLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FatigueLog_username_recordedAt_idx" ON "prisma_20250824c"."FatigueLog"("username", "recordedAt");

-- CreateIndex
CREATE INDEX "FatigueLog_username_type_recordedAt_idx" ON "prisma_20250824c"."FatigueLog"("username", "type", "recordedAt");

-- AddForeignKey
ALTER TABLE "prisma_20250824c"."FatigueLog" ADD CONSTRAINT "FatigueLog_username_fkey" FOREIGN KEY ("username") REFERENCES "prisma_20250824c"."User"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prisma_20250824c"."FatigueLog" ADD CONSTRAINT "FatigueLog_sleepLogUsername_sleepLogDate_fkey" FOREIGN KEY ("sleepLogUsername", "sleepLogDate") REFERENCES "prisma_20250824c"."SleepLog"("username", "date") ON DELETE SET NULL ON UPDATE CASCADE;
