# NoteSync Architecture Diagrams

Living documentation of the NoteSync system architecture. All diagrams use Mermaid and are renderable inside NoteSync itself.

## Overview

System-level diagrams for understanding the full platform.

- [System Context](overview/01-system-context.md) — Users, apps, and external service dependencies
- [Package Architecture](overview/02-package-architecture.md) — Monorepo structure and package dependencies
- [Entity Relationship](overview/03-entity-relationship.md) — All PostgreSQL database models
- [Deployment Topology](overview/04-deployment-topology.md) — DNS, hosting, and infrastructure
- [CI/CD Pipeline](overview/05-ci-cd-pipeline.md) — Build, test, and deployment workflow
- [AI Features Mindmap](overview/06-ai-features-mindmap.md) — All AI-powered capabilities

## Shared (Cross-Platform Flows)

Data flows that span multiple platforms.

- [Sync Engine](shared/01-sync-engine.md) — Offline-first push/pull/SSE sync protocol
- [Audio Recording Pipeline](shared/02-audio-recording-pipeline.md) — Mic/system capture → Whisper → Claude → note
- [AI Assistant Flow](shared/03-ai-assistant-flow.md) — Chat, Q&A, catch me up, meeting context
- [Note Lifecycle](shared/04-note-lifecycle.md) — State machine: created → editing → synced → deleted
- [Image Upload Flow](shared/05-image-upload-flow.md) — Upload → R2 → AI vision → embedding → sync

## API

Server-side architecture.

- [API Routes](api/01-api-routes.md) — All REST endpoints by prefix
- [API Services](api/02-api-services.md) — Service layer connecting routes to external APIs

## Web

Web app (ns-web) specific architecture.

- [Editor Architecture](web/01-editor-architecture.md) — CodeMirror 6 extensions and preview pipeline

## Desktop

Desktop app (ns-desktop) specific architecture.

- [Tauri Architecture](desktop/01-tauri-architecture.md) — WebView ↔ Rust bridge ↔ native APIs
- [SQLite Schema](desktop/02-sqlite-schema.md) — Local database tables and relationships

## Mobile

Mobile app (ns-mobile) specific architecture.

- [Mobile Architecture](mobile/01-mobile-architecture.md) — React Native navigation, state, and data layers
