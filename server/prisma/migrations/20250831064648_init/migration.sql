-- CreateTable
CREATE TABLE "prisma_20250824c"."User" (
    "username" STRING NOT NULL,
    "passwordHash" STRING NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "prisma_20250824c"."SleepLog" (
    "username" STRING NOT NULL,
    "date" STRING NOT NULL,
    "sleepStart" STRING,
    "sleepEnd" STRING,
    "fatigue" INT4,

    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("username","date")
);

-- CreateTable
CREATE TABLE "prisma_20250824c"."Schedule" (
    "username" STRING NOT NULL,
    "date" STRING NOT NULL,
    "start" STRING NOT NULL,
    "end" STRING NOT NULL,
    "title" STRING NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("username","date","start")
);

-- CreateIndex
CREATE INDEX "SleepLog_username_date_idx" ON "prisma_20250824c"."SleepLog"("username", "date");

-- CreateIndex
CREATE INDEX "Schedule_username_date_idx" ON "prisma_20250824c"."Schedule"("username", "date");

-- AddForeignKey
ALTER TABLE "prisma_20250824c"."SleepLog" ADD CONSTRAINT "SleepLog_username_fkey" FOREIGN KEY ("username") REFERENCES "prisma_20250824c"."User"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prisma_20250824c"."Schedule" ADD CONSTRAINT "Schedule_username_fkey" FOREIGN KEY ("username") REFERENCES "prisma_20250824c"."User"("username") ON DELETE CASCADE ON UPDATE CASCADE;
