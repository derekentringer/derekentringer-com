-- CreateTable: users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backupCodes" JSONB NOT NULL DEFAULT '[]',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable: password_reset_tokens
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateTable: settings
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- Seed admin user (admin-001, dentringer@gmail.com)
-- Password hash is a placeholder — admin must reset password on first login
INSERT INTO "users" ("id", "email", "passwordHash", "role", "mustChangePassword", "updatedAt")
VALUES ('admin-001', 'dentringer@gmail.com', '$placeholder$', 'admin', true, CURRENT_TIMESTAMP);

-- Add userId columns (nullable first for backfill)
ALTER TABLE "accounts" ADD COLUMN "userId" TEXT;
ALTER TABLE "categories" ADD COLUMN "userId" TEXT;
ALTER TABLE "category_rules" ADD COLUMN "userId" TEXT;
ALTER TABLE "budgets" ADD COLUMN "userId" TEXT;
ALTER TABLE "bills" ADD COLUMN "userId" TEXT;
ALTER TABLE "income_sources" ADD COLUMN "userId" TEXT;
ALTER TABLE "goals" ADD COLUMN "userId" TEXT;
ALTER TABLE "target_allocations" ADD COLUMN "userId" TEXT;
ALTER TABLE "device_tokens" ADD COLUMN "userId" TEXT;
ALTER TABLE "notification_preferences" ADD COLUMN "userId" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN "userId" TEXT;
ALTER TABLE "ai_insight_preferences" ADD COLUMN "userId" TEXT;
ALTER TABLE "ai_insight_cache" ADD COLUMN "userId" TEXT;
ALTER TABLE "ai_insight_usage" ADD COLUMN "userId" TEXT;
ALTER TABLE "ai_insight_statuses" ADD COLUMN "userId" TEXT;

-- Backfill all existing data to admin-001
UPDATE "accounts" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "categories" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "category_rules" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "budgets" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "bills" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "income_sources" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "goals" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "target_allocations" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "device_tokens" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "notification_preferences" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "notification_logs" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "ai_insight_preferences" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "ai_insight_cache" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "ai_insight_usage" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
UPDATE "ai_insight_statuses" SET "userId" = 'admin-001' WHERE "userId" IS NULL;

-- Make userId NOT NULL after backfill
ALTER TABLE "accounts" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "category_rules" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "budgets" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "bills" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "income_sources" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "target_allocations" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "device_tokens" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "notification_preferences" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "notification_logs" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ai_insight_preferences" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ai_insight_cache" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ai_insight_usage" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ai_insight_statuses" ALTER COLUMN "userId" SET NOT NULL;

-- Add FK to refresh_tokens (userId column already exists but no FK)
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill refresh_tokens to admin-001 (clean up orphans first)
DELETE FROM "refresh_tokens" WHERE "userId" NOT IN (SELECT "id" FROM "users");

-- Add userId indexes
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");
CREATE INDEX "categories_userId_idx" ON "categories"("userId");
CREATE INDEX "category_rules_userId_idx" ON "category_rules"("userId");
CREATE INDEX "budgets_userId_idx" ON "budgets"("userId");
CREATE INDEX "bills_userId_idx" ON "bills"("userId");
CREATE INDEX "income_sources_userId_idx" ON "income_sources"("userId");
CREATE INDEX "goals_userId_idx" ON "goals"("userId");
CREATE INDEX "target_allocations_userId_idx" ON "target_allocations"("userId");
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");
CREATE INDEX "notification_preferences_userId_idx" ON "notification_preferences"("userId");
CREATE INDEX "notification_logs_userId_idx" ON "notification_logs"("userId");
CREATE INDEX "ai_insight_preferences_userId_idx" ON "ai_insight_preferences"("userId");
CREATE INDEX "ai_insight_cache_userId_idx" ON "ai_insight_cache"("userId");
CREATE INDEX "ai_insight_usage_userId_idx" ON "ai_insight_usage"("userId");
CREATE INDEX "ai_insight_statuses_userId_idx" ON "ai_insight_statuses"("userId");

-- Add FKs for all userId columns
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "target_allocations" ADD CONSTRAINT "target_allocations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_insight_preferences" ADD CONSTRAINT "ai_insight_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_insight_cache" ADD CONSTRAINT "ai_insight_cache_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_insight_usage" ADD CONSTRAINT "ai_insight_usage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_insight_statuses" ADD CONSTRAINT "ai_insight_statuses_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update unique constraints to be per-user

-- Category: name was @unique, now @@unique([userId, name])
DROP INDEX "categories_name_key";
CREATE UNIQUE INDEX "categories_userId_name_key" ON "categories"("userId", "name");

-- Budget: @@unique([category, effectiveFrom]) → @@unique([userId, category, effectiveFrom])
DROP INDEX "budgets_category_effectiveFrom_key";
CREATE UNIQUE INDEX "budgets_userId_category_effectiveFrom_key" ON "budgets"("userId", "category", "effectiveFrom");

-- NotificationPreference: type was @unique, now @@unique([userId, type])
DROP INDEX "notification_preferences_type_key";
CREATE UNIQUE INDEX "notification_preferences_userId_type_key" ON "notification_preferences"("userId", "type");

-- AiInsightUsage: date was @unique, now @@unique([userId, date])
DROP INDEX "ai_insight_usage_date_key";
CREATE UNIQUE INDEX "ai_insight_usage_userId_date_key" ON "ai_insight_usage"("userId", "date");

-- AiInsightCache: @@unique([scope, contentHash]) → @@unique([userId, scope, contentHash])
DROP INDEX "ai_insight_cache_scope_contentHash_key";
CREATE UNIQUE INDEX "ai_insight_cache_userId_scope_contentHash_key" ON "ai_insight_cache"("userId", "scope", "contentHash");

-- TargetAllocation: @@unique([accountId, assetClass]) → @@unique([userId, accountId, assetClass])
DROP INDEX "target_allocations_accountId_assetClass_key";
CREATE UNIQUE INDEX "target_allocations_userId_accountId_assetClass_key" ON "target_allocations"("userId", "accountId", "assetClass");
