-- CreateTable
CREATE TABLE "images" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "r2Url" TEXT NOT NULL,
    "altText" TEXT NOT NULL DEFAULT '',
    "aiDescription" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "images_r2Key_key" ON "images"("r2Key");

-- CreateIndex
CREATE INDEX "images_noteId_idx" ON "images"("noteId");

-- CreateIndex
CREATE INDEX "images_userId_idx" ON "images"("userId");

-- CreateIndex
CREATE INDEX "images_updatedAt_idx" ON "images"("updatedAt");

-- CreateIndex
CREATE INDEX "images_deletedAt_idx" ON "images"("deletedAt");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
