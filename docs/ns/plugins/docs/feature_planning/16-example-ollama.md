# 16 — Example Plugin: Ollama (Local LLM)

**Status:** Planned
**Phase:** Example Plugins
**Priority:** High
**Plugin Type:** `ai-provider`

## Summary

Replaces NoteSync's Claude-based completion provider with a locally running Ollama instance. Zero API costs, fully offline, complete privacy. This is the most important example plugin because it proves the ProviderRegistry architecture works — AI providers are truly swappable.

## Manifest

```json
{
  "id": "notesync-ollama",
  "name": "Ollama (Local LLM)",
  "version": "1.0.0",
  "description": "Use local Ollama models for AI completions, summarization, and tagging",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "ai-provider",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "cli"],
  "settings": {
    "schema": {
      "baseUrl": { "type": "string", "description": "Ollama server URL" },
      "model": { "type": "string", "description": "Model name (e.g., llama3, mistral, gemma2)" },
      "contextLength": { "type": "number", "description": "Max context window tokens" }
    },
    "defaults": {
      "baseUrl": "http://localhost:11434",
      "model": "llama3",
      "contextLength": 8192
    }
  }
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync, CompletionProvider, CompletionOptions } from "@notesync/plugin-api";

export default class OllamaPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    // Register as the active completion provider
    host.providers.registerProvider("completion", new OllamaCompletionProvider(host));
  }

  async activate(host: NoteSync) {
    // Verify Ollama is reachable
    const settings = await host.settings.get<{ baseUrl: string }>("settings");
    const baseUrl = settings?.baseUrl ?? "http://localhost:11434";

    try {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) throw new Error("Ollama not reachable");
    } catch {
      console.warn("[Ollama] Server not reachable at", baseUrl);
    }
  }

  async deactivate() {}
}

class OllamaCompletionProvider implements CompletionProvider {
  private host: NoteSync;

  constructor(host: NoteSync) {
    this.host = host;
  }

  async *complete(prompt: string, options?: CompletionOptions): AsyncGenerator<string> {
    const settings = await this.host.settings.get<{
      baseUrl: string;
      model: string;
    }>("settings");

    const baseUrl = settings?.baseUrl ?? "http://localhost:11434";
    const model = settings?.model ?? "llama3";

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const json = JSON.parse(line);
        if (json.response) {
          yield json.response;
        }
      }
    }
  }

  async structureTranscript(transcript: string, mode: string): Promise<{ title: string; content: string; tags: string[] }> {
    const settings = await this.host.settings.get<{
      baseUrl: string;
      model: string;
    }>("settings");

    const baseUrl = settings?.baseUrl ?? "http://localhost:11434";
    const model = settings?.model ?? "llama3";

    const systemPrompt = `You are a note structuring assistant. Given a raw transcript from a ${mode} recording, create a well-structured markdown note with a title, organized content with headings, and suggested tags.

Respond in this exact JSON format:
{"title": "...", "content": "...", "tags": ["...", "..."]}`;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\nTranscript:\n${transcript}`,
        stream: false,
        format: "json",
      }),
    });

    const json = await res.json();
    return JSON.parse(json.response);
  }
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.providers.registerProvider("completion", ...)` | Replace the default AI completion provider |
| `CompletionProvider` interface | Implement `complete()` (streaming) and `structureTranscript()` |
| `AsyncGenerator<string>` | Streaming token output for real-time display |
| `host.settings.get()` | Read server URL, model name, context length |
| Plugin manifest `settings` | Declarative config for Ollama connection |

## Provider Swapping in Action

When this plugin is active, all AI features that use the `CompletionProvider` interface automatically route through Ollama instead of Claude:

- AI chat → Ollama
- Note summarization → Ollama
- Tag generation → Ollama
- Transcript structuring → Ollama
- Inline completions → Ollama

The user can switch back to NoteSync's default (Claude) by disabling this plugin in Settings → Plugins.

## E2E Encryption Compatibility

- `requiresPlaintext: false` — this plugin doesn't read notes directly. It receives prompts from the host and returns completions.
- Works in all encryption tiers. In BYOK Direct mode, this plugin is the provider — AI calls go to the local Ollama server, never to NoteSync's server.
- Ideal for E2E + No AI users who still want AI but refuse to send data to external APIs.

## Prerequisites

- Ollama installed locally (`brew install ollama` or from ollama.com)
- At least one model pulled (`ollama pull llama3`)
- Ollama server running (`ollama serve` — default port 11434)

## Tasks

- [ ] Create `packages/ns-plugin-ollama/`
- [ ] Implement `CompletionProvider` with streaming
- [ ] Implement `structureTranscript` with JSON mode
- [ ] Settings UI for base URL, model picker (fetch available models from Ollama API)
- [ ] Connection status indicator (reachable / unreachable)
- [ ] Tests: streaming output, error handling, model switching
