# 06 — Transcription

**Status:** Planned
**Phase:** 4 — Audio & Media
**Priority:** Low

## Summary

Transcribe audio files and create structured notes from the command line. Supports the same audio modes as the web/desktop app (meeting, lecture, memo, verbatim).

## Commands

```bash
ns transcribe recording.wav                            # Default mode (memo)
ns transcribe recording.wav --mode meeting             # Meeting notes structure
ns transcribe recording.wav --mode lecture              # Lecture notes structure
ns transcribe recording.mp3 --mode verbatim            # Minimal processing
ns transcribe recording.wav --folder "Meetings"        # Place in folder
ns transcribe recording.wav --tags meeting,q3           # Add tags
ns transcribe recording.wav --title "Sprint Review"    # Override generated title
```

**Progress output:**
```
⠋ Uploading recording.wav (45 MB)...
⠋ Transcribing with Whisper AI...
⠋ Structuring transcript...
⠋ Generating title and tags...
✓ Created "Sprint Planning Meeting — Q3 Review"
  Folder: Meetings
  Tags: meeting, sprint, planning
```

## Audio Format Support

Same as web/desktop: WAV, WebM, MP3, OGG, MP4

File size limit: 500 MB (server-side chunking handles large files)

## Tasks

- [ ] Create `commands/transcribe.ts`
- [ ] Multipart file upload with progress
- [ ] Display processing steps with spinner
- [ ] Support `--mode`, `--folder`, `--tags`, `--title` flags
- [ ] Output created note details
