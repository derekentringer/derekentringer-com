import {
  StateField,
  StateEffect,
  Facet,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  showTooltip,
  tooltips,
  EditorView,
  keymap,
  type Tooltip,
} from "@codemirror/view";
import type { RewriteAction } from "../api/ai.ts";

export type RewriteFn = (
  text: string,
  action: RewriteAction,
) => Promise<string>;

const REWRITE_ACTIONS: { action: RewriteAction; label: string }[] = [
  { action: "rewrite", label: "Rewrite" },
  { action: "concise", label: "Make concise" },
  { action: "fix-grammar", label: "Fix grammar" },
  { action: "to-list", label: "Convert to list" },
  { action: "expand", label: "Expand" },
  { action: "summarize", label: "Summarize" },
];

// Facet to pass the rewrite callback into the extension
const rewriteFnFacet = Facet.define<RewriteFn, RewriteFn>({
  combine: (values) => values[0],
});

// Menu state
interface RewriteMenuState {
  from: number;
  to: number;
  status: "open" | "loading" | "error";
  errorMessage?: string;
}

// Effects
const openRewriteMenu = StateEffect.define<{ from: number; to: number }>();
const closeRewriteMenu = StateEffect.define<void>();
const setRewriteLoading = StateEffect.define<void>();
const setRewriteError = StateEffect.define<string>();

// State field
const rewriteMenuField = StateField.define<RewriteMenuState | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openRewriteMenu)) {
        return {
          from: effect.value.from,
          to: effect.value.to,
          status: "open" as const,
        };
      }
      if (effect.is(closeRewriteMenu)) return null;
      if (effect.is(setRewriteLoading) && value) {
        return { ...value, status: "loading" as const };
      }
      if (effect.is(setRewriteError) && value) {
        return {
          ...value,
          status: "error" as const,
          errorMessage: effect.value,
        };
      }
    }
    // Auto-close on doc change or selection change
    if (value && (tr.docChanged || tr.selection)) return null;
    return value;
  },
  provide: (field) =>
    showTooltip.computeN([field], (state) => {
      const menu = state.field(field);
      if (!menu) return [];
      const tooltip: Tooltip = {
        pos: menu.to,
        above: true,
        create: (view) => createRewriteMenuDOM(view, menu),
      };
      return [tooltip];
    }),
});

function createRewriteMenuDOM(
  view: EditorView,
  menu: RewriteMenuState,
): { dom: HTMLElement } {
  const dom = document.createElement("div");
  dom.className = "cm-rewrite-menu";

  if (menu.status === "open") {
    for (const { action, label } of REWRITE_ACTIONS) {
      const btn = document.createElement("button");
      btn.className = "cm-rewrite-action";
      btn.textContent = label;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Prevent editor blur/selection loss
        handleRewriteAction(view, action);
      });
      dom.appendChild(btn);
    }
  } else if (menu.status === "loading") {
    const span = document.createElement("span");
    span.className = "cm-rewrite-loading";
    span.textContent = "Rewriting...";
    dom.appendChild(span);
  } else if (menu.status === "error") {
    const span = document.createElement("span");
    span.className = "cm-rewrite-error";
    span.textContent = menu.errorMessage ?? "Rewrite failed";
    dom.appendChild(span);
  }

  return { dom };
}

async function handleRewriteAction(
  view: EditorView,
  action: RewriteAction,
): Promise<void> {
  const menu = view.state.field(rewriteMenuField);
  if (!menu) return;

  const { from, to } = menu;
  const rewriteFn = view.state.facet(rewriteFnFacet);

  view.dispatch({ effects: setRewriteLoading.of(undefined) });

  try {
    const result = await rewriteFn(view.state.sliceDoc(from, to), action);
    view.dispatch({
      changes: { from, to, insert: result },
      effects: closeRewriteMenu.of(undefined),
    });
  } catch {
    view.dispatch({
      effects: setRewriteError.of("Rewrite failed"),
    });
    setTimeout(() => {
      view.dispatch({ effects: closeRewriteMenu.of(undefined) });
    }, 2000);
  }
}

// Keymap
const rewriteKeymap = Prec.high(
  keymap.of([
    {
      key: "Mod-Shift-r",
      run(view) {
        const { from, to } = view.state.selection.main;
        if (from === to) return false; // No selection
        view.dispatch({ effects: openRewriteMenu.of({ from, to }) });
        return true;
      },
    },
    {
      key: "Escape",
      run(view) {
        const menu = view.state.field(rewriteMenuField);
        if (!menu) return false;
        view.dispatch({ effects: closeRewriteMenu.of(undefined) });
        return true;
      },
    },
  ]),
);

// Right-click context menu handler
const contextMenuHandler = EditorView.domEventHandlers({
  contextmenu(event, view) {
    const { from, to } = view.state.selection.main;
    if (from === to) return false; // No selection — let browser handle it
    event.preventDefault();
    view.dispatch({ effects: openRewriteMenu.of({ from, to }) });
    return true;
  },
});

export {
  rewriteMenuField,
  openRewriteMenu,
  closeRewriteMenu,
  setRewriteLoading,
  setRewriteError,
};

export function rewriteExtension(rewriteFn: RewriteFn): Extension {
  return [
    rewriteFnFacet.of(rewriteFn),
    rewriteMenuField,
    rewriteKeymap,
    contextMenuHandler,
    tooltips(),
  ];
}
