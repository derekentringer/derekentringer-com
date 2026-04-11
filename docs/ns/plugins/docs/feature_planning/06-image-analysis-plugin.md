# 06 — Image Analysis Plugin

**Status:** Planned
**Phase:** 2 — Extract Built-in Plugins
**Priority:** Medium

## Summary

Extract Claude Vision image analysis into `@notesync/plugin-image-analysis`. Currently a fire-and-forget call in `routes/images.ts` that generates `aiDescription` for uploaded images.

## Current Implementation (to extract)

| File | Responsibility |
|---|---|
| `services/aiService.ts` | `analyzeImage()` — Claude Vision API call |
| `routes/images.ts` | Fire-and-forget analysis after upload |
| `store/imageStore.ts` | `updateAiDescription()` storage |

## Plugin Structure

```
packages/ns-plugin-image-analysis/
  src/
    index.ts
    manifest.json
    analyzer.ts           # Vision API client
  package.json
```

## Hook Integration

Uses the event system instead of being called directly:

```typescript
export default class ImageAnalysisPlugin implements Plugin {
  activate(host: NoteSync) {
    host.events.on("image:uploaded", async (image) => {
      const description = await this.analyze(image);
      await host.vault.updateImageDescription(image.id, description);
    });
  }
}
```

## Extensibility

- `@notesync/plugin-openai-vision` — Use GPT-4V instead of Claude
- `@notesync/plugin-local-vision` — Local OCR/analysis
- `@notesync/plugin-exif` — Extract EXIF metadata instead of AI analysis

## Tasks

- [ ] Create `packages/ns-plugin-image-analysis/`
- [ ] Define `ImageAnalyzer` interface in plugin-api
- [ ] Extract Claude Vision call
- [ ] Wire via `image:uploaded` event hook
- [ ] Allow provider swapping
