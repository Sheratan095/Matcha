ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(255) DEFAULT '';

-- Remove defaults if they should not be there for future inserts
ALTER TABLE "users" ALTER COLUMN "first_name" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "last_name" DROP DEFAULT;