/*
  Warnings:

  - The `lastLoginAt` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "prisma_20250824c"."User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "prisma_20250824c"."User" DROP COLUMN "lastLoginAt";
ALTER TABLE "prisma_20250824c"."User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email") WHERE "email" IS NOT NULL;

