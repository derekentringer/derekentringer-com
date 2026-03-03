-- Add tsvector column for full-text search
ALTER TABLE "notes" ADD COLUMN "search_vector" tsvector;

-- Backfill existing notes
UPDATE "notes" SET "search_vector" =
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("content", '')), 'B');

-- GIN index for fast full-text search
CREATE INDEX "notes_search_vector_idx" ON "notes" USING GIN ("search_vector");

-- Auto-update trigger
CREATE OR REPLACE FUNCTION notes_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."content", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "content" ON "notes"
  FOR EACH ROW EXECUTE FUNCTION notes_search_vector_update();
