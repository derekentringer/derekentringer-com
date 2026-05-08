import {
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { LinkPreview } from "@derekentringer/shared/ns";
import {
  formatLinkPreviewBody,
  isLikelyUrl,
} from "../lib/linkPreviewMarkdown";

// Phase E.4 — auto-fetch a link preview when the user pastes a
// single URL into the editor and replace the URL inline with the
// structured markdown shape the rest of the app uses for shared
// links. The behavior is gated by an editor setting; the caller
// passes an `enabled()` getter so the toggle takes effect without
// the editor having to be rebuilt.
//
// Replacement flow:
//   1. The standard paste handler inserts the URL at the cursor.
//   2. We see the `input.paste` user event, recognize a single
//      URL, register a tracked range, and kick off an async fetch.
//   3. If the user keeps editing, the tracked range's positions
//      are mapped through every subsequent transaction so we still
//      know where the original URL lives when the fetch resolves.
//   4. On resolve, we dispatch a transaction replacing the URL
//      with the structured markdown (title / description / image /
//      URL) and notify the caller so they can show an undo banner.
//   5. Undo replaces the structured markdown back with the bare
//      URL — using the *current* (mapped) positions, not the
//      stale ones at insertion time, so it still works after the
//      user has typed elsewhere.

interface TrackedPreview {
  id: string;
  from: number;
  to: number;
  bareUrl: string;
  status: "pending" | "inserted";
}

const addPreview = StateEffect.define<TrackedPreview>();
const updatePreview = StateEffect.define<{
  id: string;
  from: number;
  to: number;
  status: TrackedPreview["status"];
}>();
const removePreview = StateEffect.define<string>();

const trackedPreviewsField = StateField.define<TrackedPreview[]>({
  create() {
    return [];
  },
  update(value, tr) {
    let next: TrackedPreview[] = value;
    if (!tr.changes.empty) {
      // `assoc: 1` on `from` and `assoc: -1` on `to` keeps the
      // tracked range pinned to the *content* — typing immediately
      // before the block pushes `from` forward (rather than sucking
      // the new prefix into our range), and typing immediately after
      // pushes the doc out past `to` rather than expanding into it.
      next = next.map((p) => ({
        ...p,
        from: tr.changes.mapPos(p.from, 1),
        to: tr.changes.mapPos(p.to, -1),
      }));
    }
    for (const effect of tr.effects) {
      if (effect.is(addPreview)) {
        next = [...next, effect.value];
      } else if (effect.is(updatePreview)) {
        next = next.map((p) =>
          p.id === effect.value.id
            ? {
                ...p,
                from: effect.value.from,
                to: effect.value.to,
                status: effect.value.status,
              }
            : p,
        );
      } else if (effect.is(removePreview)) {
        next = next.filter((p) => p.id !== effect.value);
      }
    }
    return next;
  },
});

export interface UrlPreviewOptions {
  /** Re-checked every paste — when false, the extension is a no-op. */
  enabled: () => boolean;
  /** Calls `/links/preview` and resolves with the parsed metadata. */
  fetch: (url: string) => Promise<LinkPreview>;
  /**
   * Fired after a successful auto-replacement. The caller receives a
   * `revert` closure that swaps the structured markdown back to the
   * bare URL — used to power a "Show URL only" affordance.
   */
  onPreviewInserted?: (ctx: {
    url: string;
    revert: () => void;
  }) => void;
}

/**
 * Returns the most recent paste insertion in `tr` if it's a single
 * URL, otherwise null. The caller already has the doc state and
 * just needs the (from, to, url) tuple.
 */
function detectSingleUrlPaste(
  tr: import("@codemirror/state").Transaction,
): { from: number; to: number; url: string } | null {
  if (!tr.isUserEvent("input.paste")) return null;
  let result: { from: number; to: number; url: string } | null = null;
  let multipleChanges = false;
  tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
    if (multipleChanges) return;
    if (result !== null) {
      multipleChanges = true;
      return;
    }
    const text = inserted.toString();
    if (!isLikelyUrl(text)) return;
    result = { from: fromB, to: toB, url: text.trim() };
  });
  return multipleChanges ? null : result;
}

let nextId = 0;

export function urlPreviewExtension(opts: UrlPreviewOptions): Extension {
  const updateListener = EditorView.updateListener.of((update) => {
    if (!opts.enabled()) return;
    for (const tr of update.transactions) {
      const detected = detectSingleUrlPaste(tr);
      if (!detected) continue;

      const id = `urlpreview-${++nextId}`;
      const view = update.view;
      const tracked: TrackedPreview = {
        id,
        from: detected.from,
        to: detected.to,
        bareUrl: detected.url,
        status: "pending",
      };
      view.dispatch({ effects: addPreview.of(tracked) });

      void (async () => {
        let preview: LinkPreview;
        try {
          preview = await opts.fetch(detected.url);
        } catch {
          // Fetch failed — leave the bare URL in place and
          // discard our tracking entry.
          view.dispatch({ effects: removePreview.of(id) });
          return;
        }

        // Skip when the upstream returned no enrichable metadata
        // (sites that block scrapers, paywalls, JS-only pages,
        // etc. all hit this path). Replacing the URL with itself
        // is a no-op edit but the toast would still fire,
        // confusing the user about what just happened. Treat the
        // preview as a soft-failure: leave the bare URL alone.
        const hasMetadata = !!(
          preview.title ||
          preview.description ||
          preview.imageUrl
        );
        if (!hasMetadata) {
          view.dispatch({ effects: removePreview.of(id) });
          return;
        }

        // Look up the *current* tracked range — the user may have
        // edited elsewhere, shifting positions, while the fetch
        // was in flight. The state field has been mapping our
        // positions on every transaction, so it's authoritative.
        const current = view.state
          .field(trackedPreviewsField)
          .find((p) => p.id === id);
        if (!current) return; // user removed the URL before fetch resolved

        const replacement = formatLinkPreviewBody(preview, {
          includeTitleHeading: false,
        });

        const replaceFrom = current.from;
        const replaceTo = current.to;
        view.dispatch({
          changes: { from: replaceFrom, to: replaceTo, insert: replacement },
          effects: updatePreview.of({
            id,
            from: replaceFrom,
            to: replaceFrom + replacement.length,
            status: "inserted",
          }),
          userEvent: "input.replace.linkpreview",
        });

        opts.onPreviewInserted?.({
          url: detected.url,
          revert: () => {
            const v = view.state
              .field(trackedPreviewsField)
              .find((p) => p.id === id);
            if (!v) return;
            view.dispatch({
              changes: { from: v.from, to: v.to, insert: detected.url },
              effects: removePreview.of(id),
              userEvent: "input.revert.linkpreview",
            });
          },
        });
      })();
    }
  });

  return [trackedPreviewsField, updateListener];
}
