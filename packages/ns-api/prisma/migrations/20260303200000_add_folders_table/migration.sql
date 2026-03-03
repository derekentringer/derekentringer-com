-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folders_name_key" ON "folders"("name");

-- Backfill: add entries for any existing note folders
INSERT INTO "folders" ("id", "name")
SELECT gen_random_uuid(), "folder"
FROM "notes"
WHERE "folder" IS NOT NULL AND "deletedAt" IS NULL
GROUP BY "folder"
ON CONFLICT DO NOTHING;
