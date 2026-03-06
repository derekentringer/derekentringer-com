-- Create users table
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Create passkeys table
CREATE TABLE "passkeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" JSONB NOT NULL DEFAULT '[]',
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "friendlyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "passkeys_credentialId_key" ON "passkeys"("credentialId");
CREATE INDEX "passkeys_userId_idx" ON "passkeys"("userId");
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create password_reset_tokens table
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- Seed admin user with placeholder password (will be set at startup)
INSERT INTO "users" ("id", "email", "passwordHash", "role", "updatedAt")
VALUES ('admin-001', 'derekentringer@gmail.com', 'PLACEHOLDER', 'admin', CURRENT_TIMESTAMP);

-- Add userId to notes (nullable first for backfill)
ALTER TABLE "notes" ADD COLUMN "userId" TEXT;
UPDATE "notes" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
ALTER TABLE "notes" ALTER COLUMN "userId" SET NOT NULL;
CREATE INDEX "notes_userId_idx" ON "notes"("userId");
ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add userId to folders (nullable first for backfill)
ALTER TABLE "folders" ADD COLUMN "userId" TEXT;
UPDATE "folders" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
ALTER TABLE "folders" ALTER COLUMN "userId" SET NOT NULL;
CREATE INDEX "folders_userId_idx" ON "folders"("userId");
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update folders unique constraint to be per-user
ALTER TABLE "folders" DROP CONSTRAINT IF EXISTS "folders_parentId_name_key";
CREATE UNIQUE INDEX "folders_userId_parentId_name_key" ON "folders"("userId", "parentId", "name");

-- Add userId to sync_cursors (nullable first for backfill)
ALTER TABLE "sync_cursors" ADD COLUMN "userId" TEXT;
UPDATE "sync_cursors" SET "userId" = 'admin-001' WHERE "userId" IS NULL;
ALTER TABLE "sync_cursors" ALTER COLUMN "userId" SET NOT NULL;

-- Update sync_cursors PK to include userId
ALTER TABLE "sync_cursors" DROP CONSTRAINT "sync_cursors_pkey";
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("userId", "deviceId");

-- Add FK from refresh_tokens to users
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
