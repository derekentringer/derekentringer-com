-- CreateTable
CREATE TABLE "note_links" (
    "id" TEXT NOT NULL,
    "sourceNoteId" TEXT NOT NULL,
    "targetNoteId" TEXT NOT NULL,
    "linkText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_links_sourceNoteId_idx" ON "note_links"("sourceNoteId");

-- CreateIndex
CREATE INDEX "note_links_targetNoteId_idx" ON "note_links"("targetNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "note_links_sourceNoteId_targetNoteId_linkText_key" ON "note_links"("sourceNoteId", "targetNoteId", "linkText");

-- AddForeignKey
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_targetNoteId_fkey" FOREIGN KEY ("targetNoteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
