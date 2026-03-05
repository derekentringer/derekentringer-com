import {
  StateField,
  StateEffect,
  type Extension,
  Prec,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";

// Effects
const setGhostText = StateEffect.define<string>();
const clearGhostText = StateEffect.define<void>();

// State field holding current ghost text
const ghostTextField = StateField.define<string>({
  create: () => "",
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) return effect.value;
      if (effect.is(clearGhostText)) return "";
    }
    // Clear on any doc change (user typing)
    if (tr.docChanged) return "";
    return value;
  },
});

// Widget to render ghost text
class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ghost-text";
    span.textContent = this.text;
    return span;
  }

  eq(other: GhostTextWidget): boolean {
    return this.text === other.text;
  }
}

// Decoration that shows ghost text after cursor
const ghostTextDecorations = EditorView.decorations.compute(
  [ghostTextField],
  (state) => {
    const text = state.field(ghostTextField);
    if (!text) return Decoration.none;

    const pos = state.selection.main.head;
    const widget = Decoration.widget({
      widget: new GhostTextWidget(text),
      side: 1,
    });

    return Decoration.set([widget.range(pos)]);
  },
);

type FetchFn = (
  context: string,
  signal: AbortSignal,
) => AsyncGenerator<string>;

// ViewPlugin to manage debounce and fetch lifecycle
function createGhostTextPlugin(fetchFn: FetchFn) {
  return ViewPlugin.fromClass(
    class {
      private debounceTimer: ReturnType<typeof setTimeout> | null = null;
      private abortController: AbortController | null = null;

      update(update: ViewUpdate) {
        // Only trigger on doc changes (user typing)
        if (!update.docChanged) return;

        this.cancelPending();

        // Start debounce
        this.debounceTimer = setTimeout(() => {
          this.fetchGhostText(update.view);
        }, 600);
      }

      private cancelPending() {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
      }

      private async fetchGhostText(view: EditorView) {
        const state = view.state;
        const pos = state.selection.main.head;
        const doc = state.doc.toString();

        // Get last ~500 chars before cursor as context
        const start = Math.max(0, pos - 500);
        const context = doc.slice(start, pos);

        if (!context.trim()) return;

        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
          let accumulated = "";

          for await (const chunk of fetchFn(context, signal)) {
            if (signal.aborted) return;

            accumulated += chunk;

            view.dispatch({
              effects: setGhostText.of(accumulated),
            });
          }
        } catch {
          // Aborted or network error — silent
        }
      }

      destroy() {
        this.cancelPending();
      }
    },
  );
}

// Keymap: Tab to accept, Escape to dismiss
const ghostTextKeymap = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run(view) {
        const text = view.state.field(ghostTextField);
        if (!text) return false;

        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: text },
          selection: { anchor: pos + text.length },
          effects: clearGhostText.of(undefined),
        });
        return true;
      },
    },
    {
      key: "Escape",
      run(view) {
        const text = view.state.field(ghostTextField);
        if (!text) return false;

        view.dispatch({
          effects: clearGhostText.of(undefined),
        });
        return true;
      },
    },
  ]),
);

type ContinueWritingFetchFn = (
  context: string,
  signal: AbortSignal,
  style: string,
) => AsyncGenerator<string>;

export function continueWritingKeymap(
  fetchFn: ContinueWritingFetchFn,
  getTitle?: () => string,
): Extension {
  let abortController: AbortController | null = null;

  return [
    ghostTextField,
    ghostTextDecorations,
    ghostTextKeymap,
    Prec.highest(
    keymap.of([
      {
        key: "Mod-Shift-Space",
        run(view) {
          const text = view.state.field(ghostTextField);
          if (text) return false;

          const pos = view.state.selection.main.head;
          const doc = view.state.doc.toString();
          const start = Math.max(0, pos - 500);
          const editorContext = doc.slice(start, pos);

          const title = getTitle?.() ?? "";
          const context = editorContext.trim()
            ? editorContext
            : title.trim()
              ? `Title: ${title.trim()}`
              : "";

          if (!context) return false;

          const style = doc.trim().length < 50 ? "structure" : "paragraph";

          if (abortController) {
            abortController.abort();
          }
          abortController = new AbortController();
          const signal = abortController.signal;

          (async () => {
            try {
              let accumulated = "";
              for await (const chunk of fetchFn(context, signal, style)) {
                if (signal.aborted) return;
                accumulated += chunk;
                view.dispatch({
                  effects: setGhostText.of(accumulated),
                });
              }
            } catch {
              // Aborted or network error — silent
            }
          })();

          return true;
        },
      },
    ]),
  ),
  ];
}

export { ghostTextField, setGhostText, clearGhostText };

export function ghostTextExtension(fetchFn: FetchFn): Extension {
  return [
    ghostTextField,
    ghostTextDecorations,
    createGhostTextPlugin(fetchFn),
    ghostTextKeymap,
  ];
}
