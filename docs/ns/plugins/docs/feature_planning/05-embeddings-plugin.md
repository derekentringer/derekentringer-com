# 05 — Embeddings Plugin

**Status:** Planned
**Phase:** 2 — Extract Built-in Plugins
**Priority:** Medium

## Summary

Extract Voyage AI embedding generation and pgvector semantic search into `@notesync/plugin-embeddings`. Currently in `embeddingService.ts`, `embeddingProcessor.ts`, and noteStore's search functions.

## Current Implementation (to extract)

| File | Responsibility |
|---|---|
| `services/embeddingService.ts` | Voyage AI API calls (document + query embeddings) |
| `services/embeddingProcessor.ts` | Background processor for pending note embeddings |
| `store/noteStore.ts` | `findRelevantNotes()`, `findMeetingContextNotes()`, `semanticSearch()`, `hybridSearch()` |
| `routes/ai.ts` | `/ai/embeddings/*` endpoints (enable, disable, generate, status) |

## Plugin Structure

```
packages/ns-plugin-embeddings/
  src/
    index.ts
    manifest.json
    voyageClient.ts       # Voyage AI API client
    processor.ts          # Background embedding processor
    search.ts             # Semantic + hybrid search
    routes.ts             # Embedding management endpoints
  package.json
```

## Extensibility

Swappable embedding providers:
- `@notesync/plugin-openai-embeddings` — OpenAI text-embedding-3-small
- `@notesync/plugin-local-embeddings` — Run embeddings locally (e.g., via transformers.js or Ollama)
- `@notesync/plugin-cohere-embeddings` — Cohere embed API

Each registers the same `EmbeddingService` interface:

```typescript
export interface EmbeddingService {
  embedDocument(text: string): Promise<number[]>;
  embedQuery(text: string): Promise<number[]>;
  dimensions: number;
}
```

## Tasks

- [ ] Create `packages/ns-plugin-embeddings/`
- [ ] Define `EmbeddingService` interface in plugin-api
- [ ] Extract Voyage client, processor, search
- [ ] Register search functions via VaultAPI extension
- [ ] Register routes via plugin Fastify context
- [ ] Allow provider swapping via settings
