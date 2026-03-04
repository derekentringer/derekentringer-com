import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from "react";
import { EditorView, keymap, placeholder, lineNumbers } from "@codemirror/view";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

export interface MarkdownEditorHandle {
  focus: () => void;
  insertBold: () => void;
  insertItalic: () => void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  showLineNumbers?: boolean;
  readOnly?: boolean;
  extensions?: Extension[];
}

function wrapSelection(view: EditorView, marker: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const wrapped = `${marker}${selected}${marker}`;
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: {
      anchor: from + marker.length,
      head: to + marker.length,
    },
  });
}

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0f1117",
      color: "#ececec",
      fontFamily: "'Roboto Mono', monospace",
      fontSize: "14px",
    },
    ".cm-content": {
      caretColor: "#d4e157",
      padding: "12px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#d4e157",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgba(212, 225, 87, 0.15)",
    },
    ".cm-gutters": {
      backgroundColor: "#10121a",
      color: "#666666",
      borderRight: "1px solid #1e2028",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(212, 225, 87, 0.05)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.02)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-placeholder": {
      color: "#666666",
    },
    ".cm-ghost-text": {
      opacity: "0.4",
      fontStyle: "italic",
    },
    ".cm-tooltip .cm-rewrite-menu": {
      backgroundColor: "#10121a",
      border: "1px solid #1e2028",
      borderRadius: "6px",
      display: "flex",
      flexDirection: "column",
      padding: "4px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
      minWidth: "160px",
    },
    ".cm-rewrite-action": {
      width: "100%",
      backgroundColor: "transparent",
      color: "#ececec",
      border: "none",
      borderRadius: "4px",
      padding: "6px 10px",
      textAlign: "left",
      cursor: "pointer",
      fontSize: "13px",
      lineHeight: "1.4",
    },
    ".cm-rewrite-action:hover": {
      backgroundColor: "rgba(212, 225, 87, 0.1)",
      color: "#d4e157",
    },
    ".cm-rewrite-loading": {
      color: "#d4e157",
      padding: "6px 10px",
      fontSize: "13px",
    },
    ".cm-rewrite-error": {
      color: "#dc2626",
      padding: "6px 10px",
      fontSize: "13px",
    },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: "#d4e157", fontWeight: "bold", fontSize: "1.4em" },
  { tag: tags.heading2, color: "#d4e157", fontWeight: "bold", fontSize: "1.2em" },
  { tag: tags.heading3, color: "#d4e157", fontWeight: "bold", fontSize: "1.1em" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: "#d4e157", fontWeight: "bold" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: [tags.monospace, tags.processingInstruction], color: "#999999", fontFamily: "'Roboto Mono', monospace" },
  { tag: tags.link, color: "#d4e157", textDecoration: "underline" },
  { tag: tags.url, color: "#999999" },
  { tag: tags.quote, color: "#999999", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

export const MarkdownEditor = forwardRef(function MarkdownEditor(
  props: MarkdownEditorProps,
  ref: Ref<MarkdownEditorHandle>,
) {
  const {
    value,
    onChange,
    onSave,
    placeholder: placeholderText = "Start writing...",
    className,
    style,
    showLineNumbers = false,
    readOnly = false,
    extensions: extraExtensions = [],
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const lineNumberCompartment = useRef(new Compartment());

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    insertBold: () => {
      if (viewRef.current) wrapSelection(viewRef.current, "**");
    },
    insertItalic: () => {
      if (viewRef.current) wrapSelection(viewRef.current, "*");
    },
  }));

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown({ codeLanguages: languages }),
          darkTheme,
          syntaxHighlighting(highlightStyle),
          lineNumberCompartment.current.of(
            showLineNumbers ? lineNumbers() : [],
          ),
          EditorView.lineWrapping,
          history(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
            {
              key: "Mod-b",
              run: (v) => {
                wrapSelection(v, "**");
                return true;
              },
            },
            {
              key: "Mod-i",
              run: (v) => {
                wrapSelection(v, "*");
                return true;
              },
            },
          ]),
          placeholder(placeholderText),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorState.readOnly.of(readOnly),
          ...extraExtensions,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate on mount/unmount — external value sync handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Toggle line numbers
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumberCompartment.current.reconfigure(
        showLineNumbers ? lineNumbers() : [],
      ),
    });
  }, [showLineNumbers]);

  return <div ref={containerRef} className={className} style={style} />;
});
