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

function getThemeColors(view: EditorView): { bg: string; border: string; text: string; shadow: string } {
  const dark = view.state.facet(EditorView.darkTheme);
  return dark
    ? { bg: "#10121a", border: "#1e2028", text: "#ececec", shadow: "0 4px 12px rgba(0,0,0,0.4)" }
    : { bg: "#ffffff", border: "#e0e0e0", text: "#1a1a2e", shadow: "0 4px 12px rgba(0,0,0,0.15)" };
}

function createRewriteMenuDOM(
  view: EditorView,
  menu: RewriteMenuState,
): { dom: HTMLElement } {
  const colors = getThemeColors(view);

  const dom = document.createElement("div");
  Object.assign(dom.style, {
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    display: "flex",
    flexDirection: "column",
    padding: "4px",
    boxShadow: colors.shadow,
    fontFamily: '"Roboto", "Tahoma", Verdana, sans-serif',
  });

  if (menu.status === "open") {
    for (const { action, label } of REWRITE_ACTIONS) {
      const btn = document.createElement("button");
      Object.assign(btn.style, {
        backgroundColor: "transparent",
        color: colors.text,
        border: "none",
        borderRadius: "4px",
        padding: "6px 10px",
        textAlign: "left",
        cursor: "pointer",
        fontSize: "13px",
        lineHeight: "1.4",
        whiteSpace: "nowrap",
      });
      btn.textContent = label;
      btn.addEventListener("mouseenter", () => { btn.style.backgroundColor = "rgba(128,128,128,0.15)"; });
      btn.addEventListener("mouseleave", () => { btn.style.backgroundColor = "transparent"; });
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handleRewriteAction(view, action);
      });
      dom.appendChild(btn);
    }
  } else if (menu.status === "loading") {
    const span = document.createElement("span");
    Object.assign(span.style, { padding: "6px 10px", fontSize: "13px", color: colors.text, whiteSpace: "nowrap" });
    span.textContent = "Rewriting...";
    dom.appendChild(span);
  } else if (menu.status === "error") {
    const span = document.createElement("span");
    Object.assign(span.style, { padding: "6px 10px", fontSize: "13px", color: "#dc2626", whiteSpace: "nowrap" });
    span.textContent = menu.errorMessage ?? "Rewrite failed";
    dom.appendChild(span);
  }

  // Strip default .cm-tooltip wrapper styles so only our menu controls sizing
  requestAnimationFrame(() => {
    const parent = dom.parentElement;
    if (parent?.classList.contains("cm-tooltip")) {
      parent.style.border = "none";
      parent.style.background = "transparent";
      parent.style.padding = "0";
    }
  });

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
