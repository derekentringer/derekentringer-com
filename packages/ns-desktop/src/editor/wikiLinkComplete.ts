import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

interface NoteTitleItem {
  id: string;
  title: string;
}

/**
 * Creates a CodeMirror extension for wiki-link autocomplete.
 * Detects `[[` before cursor and shows matching note titles.
 * Uses a getter function for fresh data without editor recreation.
 */
export function wikiLinkAutocomplete(
  getTitles: () => NoteTitleItem[],
): Extension {
  function wikiLinkCompletions(
    context: CompletionContext,
  ): CompletionResult | null {
    // Look for [[ before cursor with no closing ]]
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);

    // Find the last [[ that isn't closed
    const lastOpen = textBefore.lastIndexOf("[[");
    if (lastOpen === -1) return null;

    const afterOpen = textBefore.slice(lastOpen + 2);
    // If there's a ]] in between, the link is already closed
    if (afterOpen.includes("]]")) return null;

    const query = afterOpen.toLowerCase();
    const from = line.from + lastOpen + 2;

    const titles = getTitles();
    const filtered = titles
      .filter((t) => t.title.toLowerCase().includes(query))
      .slice(0, 20);

    if (filtered.length === 0 && query.length === 0) {
      // Show all titles when just typed [[
      const all = titles.slice(0, 20);
      if (all.length === 0) return null;
      return {
        from,
        options: all.map(
          (t): Completion => ({
            label: t.title,
            apply: `${t.title}]]`,
          }),
        ),
      };
    }

    if (filtered.length === 0) return null;

    return {
      from,
      options: filtered.map(
        (t): Completion => ({
          label: t.title,
          apply: `${t.title}]]`,
        }),
      ),
    };
  }

  const autocompleteTheme = EditorView.theme({
    ".cm-tooltip.cm-tooltip-autocomplete": {
      backgroundColor: "var(--color-popover, #10121a)",
      border: "1px solid var(--color-border, #1e2028)",
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete ul": {
      fontFamily: "'Roboto Mono', monospace",
      fontSize: "13px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete ul li": {
      padding: "4px 8px",
      color: "var(--color-foreground, #ececec)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--color-accent, rgba(255,255,255,0.03))",
      color: "var(--color-primary, #d4e157)",
    },
  });

  return [
    autocompletion({
      override: [wikiLinkCompletions],
      activateOnTyping: true,
    }),
    autocompleteTheme,
  ];
}
