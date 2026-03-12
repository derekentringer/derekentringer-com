-- Fix folder unique indexes to:
-- 1. Exclude soft-deleted folders (allow re-creating folders with the same name after deletion)
-- 2. Include userId in root-level constraint (was missed in multi-user migration)

-- Drop the old indexes
DROP INDEX IF EXISTS "folders_root_name_key";
DROP INDEX IF EXISTS "folders_userId_parentId_name_key";

-- Recreate with deletedAt IS NULL filter
CREATE UNIQUE INDEX "folders_root_name_key" ON "folders"("userId", "name") WHERE "parentId" IS NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "folders_userId_parentId_name_key" ON "folders"("userId", "parentId", "name") WHERE "deletedAt" IS NULL;
