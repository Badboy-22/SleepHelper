-- 1) Add columns as NULLABLE so we can backfill
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NULL;

-- Optional profile columns (nullable)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" STRING NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" STRING NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" STRING NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" STRING NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prefs" JSONB NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP NULL;

-- 2) Backfill existing rows
UPDATE "User" SET "id" = gen_random_uuid() WHERE "id" IS NULL;
UPDATE "User" SET "createdAt" = now()        WHERE "createdAt" IS NULL;
UPDATE "User" SET "updatedAt" = now()        WHERE "updatedAt" IS NULL;

-- 3) Make username unique (it used to be the PK)
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User" ("username");

-- 4) Email unique when present (optional)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email") WHERE "email" IS NOT NULL;

-- 5) NOW make id NOT NULL BEFORE changing PK
ALTER TABLE "User" ALTER COLUMN "id" SET NOT NULL;

-- 6) Change primary key to id
ALTER TABLE "User" ALTER PRIMARY KEY USING COLUMNS ("id");

-- 7) Enforce NOT NULLs for timestamps after backfill
ALTER TABLE "User" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET NOT NULL;

-- (Optional) DB defaults
-- ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now();
-- ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT now();
