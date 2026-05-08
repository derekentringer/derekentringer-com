// Minimal type shim for `react-native-syntax-highlighter` — the
// upstream package ships JS only, with no `.d.ts` and no
// @types/react-native-syntax-highlighter on DefinitelyTyped.
//
// We only declare the surface we actually consume in
// `MarkdownCodeBlock.tsx`. Adjust if/when usage broadens.

declare module "react-native-syntax-highlighter" {
  import type { ComponentType, ComponentType as CT, ReactNode } from "react";
  import type { TextStyle } from "react-native";

  interface NativeSyntaxHighlighterProps {
    /** Code body to highlight. */
    children: string;
    /** Highlight.js / Prism language name (`js`, `python`, …). */
    language?: string;
    /** Style object in the shape produced by react-syntax-
     *  highlighter's hljs/prism theme files: a map from CSS class
     *  name (`hljs`, `hljs-keyword`, …) to a style record. */
    style?: Record<string, Record<string, string | number>>;
    /** "highlightjs" (default) or "prism". */
    highlighter?: "highlightjs" | "prism";
    /** Monospace font family override. */
    fontFamily?: string;
    /** Body font size in pixels. */
    fontSize?: number;
    /** Custom Pre wrapper. The lib defaults to a horizontal
     *  ScrollView; override to plain View when nesting inside an
     *  outer scroller. Typed loosely because callers pass either
     *  a class component (View) or a function component. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PreTag?: CT<any>;
    /** Custom Code wrapper, same rationale as PreTag. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CodeTag?: CT<any>;
    /** Inline style applied to the Pre wrapper. */
    customStyle?: TextStyle;
    /** Whether to enable horizontal scrolling on the lib's
     *  internal Pre wrapper. Irrelevant when PreTag is overridden
     *  to a non-ScrollView. */
    horizontal?: boolean;
  }

  const NativeSyntaxHighlighter: ComponentType<NativeSyntaxHighlighterProps>;
  export default NativeSyntaxHighlighter;
  export type { NativeSyntaxHighlighterProps };

  // Children prop is rendered between PreTag and the highlighted
  // tokens; expose ReactNode-compatible export to satisfy the
  // surface used by callers that pass anything other than string.
  // Currently unused.
  export type ChildrenLike = ReactNode;
}
