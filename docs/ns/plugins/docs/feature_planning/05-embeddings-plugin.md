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

Each implements the `EmbeddingProvider` interface from `@notesync/plugin-api` and registers via `host.providers.registerProvider("embedding", ...)`. Plugin authors bring their own API keys.

```typescript
// Example: community plugin with OpenAI embeddings
export default class OpenAIEmbeddingsPlugin implements Plugin {
  register(host: NoteSync) {
    host.providers.registerProvider("embedding", {
      embedDocument: (text) => callOpenAI(text, "text-embedding-3-small"),
      embedQuery: (text) => callOpenAI(text, "text-embedding-3-small"),
      dimensions: 1536,
    });
  }
}
```

## E2E Encryption

When a user enables E2E encryption, the embeddings plugin is **disabled**. The server cannot generate embeddings from ciphertext, and stored embeddings leak content meaning (vectors can be used to approximate the original text). On encryption enable:

- All existing embeddings for the user are deleted from pgvector
- Semantic and hybrid search fall back to client-side keyword search (FTS5 on desktop/mobile, IndexedDB FTS on web)
- The `/ai/embeddings/*` endpoints return 403 for encrypted users

**Future possibility:** Client-side embedding generation using transformers.js or a local model, with vectors stored in SQLite (desktop/mobile only). This would restore semantic search for encrypted users without server involvement. Deferred — complex and limited to platforms with local vector storage.

## Tasks

- [ ] Create `packages/ns-plugin-embeddings/`
- [ ] Define `EmbeddingService` interface in plugin-api
- [ ] Extract Voyage client, processor, search
- [ ] Register search functions via NotesAPI extension
- [ ] Register routes via plugin Fastify context
- [ ] Allow provider swapping via settings
