-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column and timestamp to Note table
ALTER TABLE "notes" ADD COLUMN "embedding" vector(512);
ALTER TABLE "notes" ADD COLUMN "embeddingUpdatedAt" TIMESTAMP(3);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX "note_embedding_idx" ON "notes" USING hnsw ("embedding" vector_cosine_ops);

-- Create Setting key-value table
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);
