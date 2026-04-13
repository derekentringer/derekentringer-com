# 25 — Example Plugin: Voice Input for AI Assistant

**Status:** Planned
**Phase:** Example Plugins
**Priority:** High
**Plugin Type:** `full` (command + UI extension)

## Summary

Adds a microphone button next to the AI Assistant's Ask button, allowing users to speak their questions instead of typing. Audio is captured, sent through the `TranscriptionProvider` (Whisper by default, swappable via BYOK), and the transcribed text is populated into the input field for review before sending. Demonstrates UI slot injection, the transcription provider interface, and workspace API integration.

## Manifest

```json
{
  "id": "notesync-voice-input",
  "name": "Voice Input",
  "version": "1.0.0",
  "description": "Speak to the AI Assistant instead of typing",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "full",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop"],
  "settings": {
    "schema": {
      "mode": { "type": "string", "enum": ["toggle", "push-to-talk"], "description": "Recording trigger mode" },
      "autoSend": { "type": "boolean", "description": "Automatically send after transcription" },
      "language": { "type": "string", "description": "Whisper language hint (e.g., 'en', 'es', 'auto')" }
    },
    "defaults": {
      "mode": "toggle",
      "autoSend": false,
      "language": "auto"
    }
  }
}
```

## User Experience

### Toggle Mode (default)
1. User clicks mic button — icon turns red, pulsing indicator appears
2. User speaks their question
3. User clicks mic button again (or presses Escape) to stop
4. Audio is sent to Whisper, transcribed text populates the input field
5. User reviews and presses Enter to send (or edits first)

### Push-to-Talk Mode
1. User holds mic button — recording starts immediately
2. User speaks while holding
3. User releases button — recording stops, transcription begins
4. Same flow as toggle from step 4

### Auto-Send Mode
- When enabled, transcribed text is sent immediately without populating the input
- Faster but no opportunity to review/edit

### Visual Feedback
- **Idle:** Mic icon (muted color) next to Ask button
- **Recording:** Mic icon pulses red, elapsed time shown, optional waveform
- **Transcribing:** Bouncing dots animation replacing mic icon
- **Error:** Brief error toast (e.g., "Couldn't understand audio, try again")

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

export default class VoiceInputPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    // Register UI component next to AI Assistant input
    host.workspace.registerSlot({
      id: "voice-input-button",
      slot: "assistant-input-actions",
      component: () => import("./VoiceInputButton"),
    });

    // Register command for keyboard shortcut
    host.commands.register({
      id: "voice-input:toggle",
      name: "Voice Input: Start/Stop Recording",
      shortcut: "Ctrl+Shift+V",
      callback: () => this.toggleRecording(),
    });
  }

  async activate() {}
  async deactivate() {
    // Stop any active recording
    this.stopRecording();
  }

  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async toggleRecording() {
    if (this.mediaRecorder?.state === "recording") {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await this.transcribeAndPopulate();
      };

      this.mediaRecorder.start(1000);
    } catch {
      this.host.workspace.showToast("Microphone permission denied", "error");
    }
  }

  private stopRecording() {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop();
    }
  }

  private async transcribeAndPopulate() {
    const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });

    // Skip tiny recordings (< 1KB)
    if (blob.size < 1024) return;

    const provider = this.host.providers.getProvider("transcription");
    if (!provider) {
      this.host.workspace.showToast("No transcription provider available", "error");
      return;
    }

    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const text = await provider.transcribe(buffer, `voice-input.webm`);

      if (!text || !text.trim()) {
        this.host.workspace.showToast("No speech detected", "warning");
        return;
      }

      const settings = await this.host.settings.get<{ autoSend: boolean }>("settings");
      if (settings?.autoSend) {
        this.host.workspace.sendAssistantMessage(text.trim());
      } else {
        this.host.workspace.setAssistantInput(text.trim());
      }
    } catch {
      this.host.workspace.showToast("Transcription failed, try again", "error");
    }
  }
}
```

## UI Component

```typescript
// VoiceInputButton.tsx
import { useState } from "react";
import type { NoteSync } from "@notesync/plugin-api";

export function VoiceInputButton({ host }: { host: NoteSync }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleClick = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      await host.commands.execute("voice-input:toggle");
      setIsTranscribing(false);
    } else {
      setIsRecording(true);
      await host.commands.execute("voice-input:toggle");
    }
  };

  const settings = host.settings.getSync<{ mode: string }>("settings");
  const isPushToTalk = settings?.mode === "push-to-talk";

  return (
    <button
      onClick={!isPushToTalk ? handleClick : undefined}
      onPointerDown={isPushToTalk ? handleClick : undefined}
      onPointerUp={isPushToTalk ? handleClick : undefined}
      className={`p-1.5 rounded transition-colors cursor-pointer ${
        isRecording
          ? "text-destructive animate-pulse"
          : isTranscribing
          ? "text-muted-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      title={isRecording ? "Stop recording" : "Voice input"}
    >
      {isTranscribing ? (
        <span className="flex items-end gap-0.5 h-4 w-4 justify-center">
          <span className="bounce-dot" />
          <span className="bounce-dot" />
          <span className="bounce-dot" />
        </span>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}
```

## Workspace API Requirements

This plugin requires two new methods on the `WorkspaceAPI` that don't exist yet:

```typescript
export interface WorkspaceAPI {
  // ... existing methods ...

  /** Set the AI Assistant input field text (for voice input, templates, etc.) */
  setAssistantInput(text: string): void;

  /** Send a message to the AI Assistant programmatically */
  sendAssistantMessage(text: string): void;

  /** Show a brief toast notification */
  showToast(message: string, level?: "info" | "warning" | "error"): void;
}
```

These methods would also be useful for other plugins (Quick Capture could use `sendAssistantMessage`, Templater could use `setAssistantInput`).

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.workspace.registerSlot()` | Inject mic button next to AI input |
| `host.providers.getProvider("transcription")` | Use the active transcription provider (Whisper or BYOK) |
| `host.workspace.setAssistantInput()` | Populate input with transcribed text |
| `host.workspace.sendAssistantMessage()` | Auto-send transcribed text |
| `host.workspace.showToast()` | Error/status notifications |
| `host.commands.register()` | Keyboard shortcut for voice toggle |
| `host.settings.get()` | Mode (toggle/push-to-talk), auto-send, language |
| `navigator.mediaDevices` | Browser mic capture (same API as AudioRecorder) |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — voice input is transcribed to text then sent as a normal chat message. No note content is accessed directly.
- Works in all encryption tiers
- Audio is processed transiently (never stored)

## Provider Swapping

Since this plugin uses the `TranscriptionProvider` interface, the underlying speech-to-text engine is swappable:
- **Default:** OpenAI Whisper (via NoteSync API)
- **BYOK:** User's own Whisper/Deepgram/AssemblyAI key
- **Local:** whisper.cpp via community plugin (no API needed)

## Tasks

- [ ] Create `packages/ns-plugin-voice-input/`
- [ ] Implement mic recording with MediaRecorder
- [ ] Integrate with TranscriptionProvider for speech-to-text
- [ ] UI button component with recording/transcribing states
- [ ] Push-to-talk and toggle modes
- [ ] Auto-send option
- [ ] Keyboard shortcut (Ctrl+Shift+V)
- [ ] Add `setAssistantInput` and `sendAssistantMessage` to WorkspaceAPI
- [ ] Tests: recording flow, transcription integration, mode switching
