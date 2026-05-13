# Archived — moved to Notate

This package was the **NoteSync desktop app** (`@derekentringer/ns-desktop`, Tauri v2). On 2026-05-12 the NoteSync product was rebranded to **Notate** and the four `ns-*` packages were extracted out of this monorepo into a dedicated repository under PixelPerfect Studios LLC.

**Active development now lives at:** [https://github.com/PixelPerfect-Studios-LLC/notate](https://github.com/PixelPerfect-Studios-LLC/notate) (`packages/desktop/`)

The new bundle identifier is `md.notate.app` (prod) / `md.notate.app.dev` (dev variant). The Tauri config, build scripts, audio capture modules, and entitlements all carried over to the Notate repo.

This snapshot is retained in `derekentringer-com` only as a historical audit reference. It receives no further:

- Bug fixes
- Feature work
- Releases / tags / builds

The migration audit trail lives in `docs/historical/notesync-to-notate-migration/` at the repo root.
