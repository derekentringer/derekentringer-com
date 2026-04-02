import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from "react";
import { EditorView, keymap, placeholder, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, Compartment, Transaction, type Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  indentUnit,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

export interface MarkdownEditorHandle {
  focus: () => void;
  insertBold: () => void;
  insertItalic: () => void;
  scrollToLine: (line: number) => void;
  getCursor: () => number;
  setCursor: (pos: number) => void;
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
  wordWrap?: boolean;
  tabSize?: number;
  fontSize?: number;
  theme?: "dark" | "light";
  accentColor?: string;
  cursorStyle?: "line" | "block" | "underline";
  cursorBlink?: boolean;
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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createDarkTheme(accent: string) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "#0f1117",
        color: "#ececec",
        fontFamily: "'Roboto Mono', monospace",
        fontSize: "14px",
      },
      ".cm-content": {
        caretColor: accent,
        padding: "12px 0",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: hexToRgba(accent, 0.15),
      },
      ".cm-gutters": {
        backgroundColor: "#10121a",
        color: "#666666",
        borderRight: "1px solid #1e2028",
      },
      ".cm-activeLineGutter": {
        backgroundColor: hexToRgba(accent, 0.05),
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
      "&.cm-focused .cm-placeholder": {
        display: "none",
      },
      ".cm-ghost-text": {
        opacity: "0.4",
        fontStyle: "italic",
      },
    },
    { dark: true },
  );
}

function createDarkHighlightStyle(accent: string) {
  return HighlightStyle.define([
    { tag: tags.heading1, color: accent, fontWeight: "bold", fontSize: "1.4em" },
    { tag: tags.heading2, color: accent, fontWeight: "bold", fontSize: "1.2em" },
    { tag: tags.heading3, color: accent, fontWeight: "bold", fontSize: "1.1em" },
    { tag: [tags.heading4, tags.heading5, tags.heading6], color: accent, fontWeight: "bold" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: [tags.monospace, tags.processingInstruction], color: "#999999", fontFamily: "'Roboto Mono', monospace" },
    { tag: tags.link, color: accent, textDecoration: "underline" },
    { tag: tags.url, color: "#999999" },
    { tag: tags.quote, color: "#999999", fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]);
}

function createLightTheme(accent: string) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "#ffffff",
        color: "#1a1a2e",
        fontFamily: "'Roboto Mono', monospace",
        fontSize: "14px",
      },
      ".cm-content": {
        caretColor: accent,
        padding: "12px 0",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: hexToRgba(accent, 0.15),
      },
      ".cm-gutters": {
        backgroundColor: "#f5f5f5",
        color: "#999999",
        borderRight: "1px solid #e0e0e0",
      },
      ".cm-activeLineGutter": {
        backgroundColor: hexToRgba(accent, 0.08),
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(0, 0, 0, 0.03)",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-scroller": {
        overflow: "auto",
      },
      ".cm-placeholder": {
        color: "#999999",
      },
      "&.cm-focused .cm-placeholder": {
        display: "none",
      },
      ".cm-ghost-text": {
        opacity: "0.4",
        fontStyle: "italic",
      },
    },
    { dark: false },
  );
}

function createLightHighlightStyle(accent: string) {
  return HighlightStyle.define([
    { tag: tags.heading1, color: accent, fontWeight: "bold", fontSize: "1.4em" },
    { tag: tags.heading2, color: accent, fontWeight: "bold", fontSize: "1.2em" },
    { tag: tags.heading3, color: accent, fontWeight: "bold", fontSize: "1.1em" },
    { tag: [tags.heading4, tags.heading5, tags.heading6], color: accent, fontWeight: "bold" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: [tags.monospace, tags.processingInstruction], color: "#666666", fontFamily: "'Roboto Mono', monospace" },
    { tag: tags.link, color: accent, textDecoration: "underline" },
    { tag: tags.url, color: "#666666" },
    { tag: tags.quote, color: "#666666", fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]);
}

function buildCursorExtensions(
  style: "line" | "block" | "underline",
  blink: boolean,
  accent: string,
): Extension[] {
  const cursorTheme: Record<string, Record<string, string>> = {
    ".cm-cursor, .cm-dropCursor": {},
  };

  if (style === "line") {
    cursorTheme[".cm-cursor, .cm-dropCursor"] = {
      borderLeftColor: accent,
      borderLeftWidth: "2px",
    };
  } else if (style === "block") {
    cursorTheme[".cm-cursor, .cm-dropCursor"] = {
      borderLeftColor: "transparent",
      borderLeftWidth: "0",
      backgroundColor: hexToRgba(accent, 0.7),
      width: "0.6em",
    };
  } else {
    // underline
    cursorTheme[".cm-cursor, .cm-dropCursor"] = {
      borderLeftColor: "transparent",
      borderLeftWidth: "0",
      borderBottom: `2px solid ${accent}`,
      width: "0.6em",
    };
  }

  return [
    drawSelection({ cursorBlinkRate: blink ? 1200 : 0 }),
    EditorView.theme(cursorTheme),
  ];
}

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
    style: styleProp,
    showLineNumbers = false,
    readOnly = false,
    extensions: extraExtensions = [],
    wordWrap = true,
    tabSize = 2,
    fontSize,
    theme = "dark",
    accentColor,
    cursorStyle = "line",
    cursorBlink = true,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const lineNumberCompartment = useRef(new Compartment());
  const wordWrapCompartment = useRef(new Compartment());
  const tabSizeCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const cursorCompartment = useRef(new Compartment());
  const pendingCursorRef = useRef<number | null>(null);

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
    scrollToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
      view.dispatch({
        selection: { anchor: lineInfo.from },
        effects: EditorView.scrollIntoView(lineInfo.from, { y: "start" }),
      });
    },
    getCursor: () => viewRef.current?.state.selection.main.head ?? 0,
    setCursor: (pos: number) => { pendingCursorRef.current = pos; },
  }));

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === "dark";
    const defaultAccent = isDark ? "#d4e157" : "#7c8a00";
    const accent = accentColor || defaultAccent;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown({ codeLanguages: languages }),
          themeCompartment.current.of([
            isDark ? createDarkTheme(accent) : createLightTheme(accent),
            syntaxHighlighting(isDark ? createDarkHighlightStyle(accent) : createLightHighlightStyle(accent)),
          ]),
          lineNumberCompartment.current.of(
            showLineNumbers ? lineNumbers() : [],
          ),
          wordWrapCompartment.current.of(
            wordWrap ? EditorView.lineWrapping : [],
          ),
          tabSizeCompartment.current.of([
            EditorState.tabSize.of(tabSize),
            indentUnit.of(" ".repeat(tabSize)),
          ]),
          cursorCompartment.current.of(
            buildCursorExtensions(cursorStyle, cursorBlink, accent),
          ),
          history(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
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
      const cursorPos = pendingCursorRef.current;
      pendingCursorRef.current = null;
      const anchor = cursorPos !== null
        ? Math.min(cursorPos, value.length)
        : 0;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor },
        effects: EditorView.scrollIntoView(anchor, { y: "center" }),
        annotations: Transaction.addToHistory.of(false),
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

  // Toggle word wrap
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wordWrapCompartment.current.reconfigure(
        wordWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [wordWrap]);

  // Update tab size
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: tabSizeCompartment.current.reconfigure([
        EditorState.tabSize.of(tabSize),
        indentUnit.of(" ".repeat(tabSize)),
      ]),
    });
  }, [tabSize]);

  // Switch theme / accent color
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const isDark = theme === "dark";
    const defaultAccent = isDark ? "#d4e157" : "#7c8a00";
    const accent = accentColor || defaultAccent;
    view.dispatch({
      effects: themeCompartment.current.reconfigure([
        isDark ? createDarkTheme(accent) : createLightTheme(accent),
        syntaxHighlighting(isDark ? createDarkHighlightStyle(accent) : createLightHighlightStyle(accent)),
      ]),
    });
  }, [theme, accentColor]);

  // Update cursor style / blink
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const isDark = theme === "dark";
    const defaultAccent = isDark ? "#d4e157" : "#7c8a00";
    const accent = accentColor || defaultAccent;
    view.dispatch({
      effects: cursorCompartment.current.reconfigure(
        buildCursorExtensions(cursorStyle, cursorBlink, accent),
      ),
    });
  }, [cursorStyle, cursorBlink, theme, accentColor]);

  const containerStyle: React.CSSProperties = {
    ...styleProp,
    ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
  };

  return <div ref={containerRef} className={className} style={containerStyle} />;
});
