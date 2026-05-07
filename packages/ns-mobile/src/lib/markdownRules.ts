import React, { useContext, useRef } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
// ScrollView is imported above only because the table/fence
// custom rules wrap their content in one — TocCaptureContext no
// longer references ScrollView (it now uses a regular View ref
// supplied by the host screen).
// react-native-markdown-display's default `image` rule does
// `<FitImage {...imageProps} />` where `imageProps.key = node.key`,
// which trips React 18+'s "key passed via spread" warning. We
// override with our own rule that extracts the key and passes it
// directly to JSX. Same FitImage component, same behavior — just
// without the spread-key shape.
import FitImage from "react-native-fit-image";
import { cleanHeadingText } from "@/lib/extractHeadings";

/**
 * Context used by Phase 4's interactive Table of Contents. The
 * host screen mounts a Provider that exposes `registerHeading`
 * plus a ref to a "ToC content baseline" View — the screen wraps
 * all of its ScrollView's children in a single `<View ref=...>`
 * and passes that ref here. Each heading rule wraps its content
 * in a `<HeadingCapture>` whose onLayout calls `measureInWindow`
 * on both the heading and the content baseline; subtracting the
 * two window-Y values yields the heading's Y inside the
 * scrollable content area — exactly what `scrollTo({y})` wants.
 *
 * Why not measure against the ScrollView itself: the ScrollView
 * container's window position is fixed (only its content scrolls
 * inside it), so the difference would be a *visible* offset, not
 * a content offset. The content-baseline View, by contrast, is a
 * direct child of the ScrollView and moves with the scroll, so
 * `headingWindowY - contentBaselineWindowY` already accounts for
 * any current scroll position — no separate offset tracking.
 *
 * We also use `measureInWindow` rather than `measureLayout` here
 * because the new RN architecture (Fabric) rejects numeric node
 * handles for measureLayout's `relativeTo` argument; window
 * coords work on both the legacy and Fabric renderers.
 *
 * When no Provider is mounted (legacy callers), captures are
 * silently dropped.
 */
export interface TocCaptureContextValue {
  registerHeading(text: string, y: number): void;
  /** Ref to a wrapper View that contains all of the ScrollView's
   *  children — the heading's Y is measured relative to it. */
  contentRef: React.RefObject<View | null>;
}
export const TocCaptureContext =
  React.createContext<TocCaptureContextValue | null>(null);

interface HeadingCaptureProps {
  /** Cleaned heading text — same shape `extractHeadings` produces
   *  so the screen can look up the captured Y by ToC label. */
  text: string;
  /** Heading body, already rendered by the AstRenderer. Marked
   *  optional so callers passing children as the 3rd arg of
   *  `React.createElement` satisfy TS without restating it. */
  children?: React.ReactNode;
  /** The View-style for this heading level (h1/h2/...). */
  style: unknown;
}

function HeadingCapture({ text, children, style }: HeadingCaptureProps) {
  const ctx = useContext(TocCaptureContext);
  const viewRef = useRef<View>(null);
  return React.createElement(
    View,
    {
      ref: viewRef,
      onLayout: () => {
        const view = viewRef.current;
        const content = ctx?.contentRef.current;
        if (!ctx || !view || !content) return;
        view.measureInWindow((_xH: number, yH: number) => {
          content.measureInWindow((_xC: number, yC: number) => {
            ctx.registerHeading(text, yH - yC);
          });
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style: style as any,
    },
    children,
  );
}

/**
 * Walk an AST node's children recursively, concatenating every
 * `text`-type leaf's content. This is more robust than reading
 * the inline child's `content` directly: depending on
 * markdown-it / react-native-markdown-display version that field
 * is sometimes empty even though leaf text nodes hold the
 * heading's raw text.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAstText(node: any): string {
  if (!node) return "";
  if (node.type === "text" && typeof node.content === "string") {
    return node.content;
  }
  if (Array.isArray(node.children) && node.children.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return node.children.map((c: any) => extractAstText(c)).join("");
  }
  if (typeof node.content === "string") return node.content;
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function headingRule(headingStyleKey: string, node: any, children: any, styles: any) {
  const text = cleanHeadingText(extractAstText(node).trim());
  return React.createElement(
    HeadingCapture,
    { key: node.key, text, style: styles[headingStyleKey] },
    children,
  );
}

// Wiki-link visual treatment per platform. Web's CSS uses
// `text-decoration: underline dashed`. RN's iOS renders `dashed`
// as very heavy/spaced dashes; `dotted` matches web's visual
// weight much more closely. Android ignores `textDecorationStyle`
// (any non-solid value renders as solid) — rather than show a
// misleading solid underline, we leave wiki-links un-decorated on
// Android and rely on color alone to distinguish them. Regular
// markdown links on Android keep the library's default solid
// underline, so the missing underline on a lime word is itself
// the wiki-link cue.
const WIKI_DECOR = Platform.select({
  ios: {
    textDecorationLine: "underline" as const,
    textDecorationStyle: "dotted" as const,
  },
  default: {},
});

// Min cell width that triggers horizontal scroll on wide tables
// while still letting simple 2–4 column tables fill the viewport.
// At ~393pt phone width: 4 cols × 100 = 400 (slight scroll), 11 cols
// × 100 = 1100 (clearly scrolls), 3 cols × 100 = 300 (fully fits).
const TABLE_CELL_MIN_WIDTH = 100;

export const markdownRules = {
  // Library's built-in image renderer signature; using `any` here
  // because the library's exported types don't include the
  // `RenderImageFunction` shape and writing them out by hand is
  // not worth the maintenance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image: (node: any, _children: any, _parent: any, styles: any, allowedImageHandlers: string[], defaultImageHandler: string | null) => {
    const src: string = node?.attributes?.src ?? "";
    const alt: string | undefined = node?.attributes?.alt;
    const show = allowedImageHandlers.some((v) =>
      src.toLowerCase().startsWith(v.toLowerCase()),
    );
    if (!show && defaultImageHandler === null) return null;
    return React.createElement(FitImage, {
      key: node.key,
      // `indicator: false` suppresses react-native-fit-image's
      // ActivityIndicator overlay. R2 images load fast enough that
      // the spinner is more noise than progress signal — the
      // default rule turns it on; we explicitly turn it off.
      indicator: false,
      style: styles._VIEW_SAFE_image,
      source: {
        uri: show ? src : `${defaultImageHandler}${src}`,
      },
      ...(alt
        ? { accessible: true, accessibilityLabel: alt }
        : {}),
    });
  },
  // Override the default link rule so wiki-links, broken wiki-
  // links, and task checkboxes get their own styling. Regular
  // links keep `styles.link` exactly as before (lime via
  // themeColors.primary, no underline). The handler mirrors the
  // library's openUrl helper inline (the lib's exported helper
  // has a single-arg type declaration that doesn't match its
  // runtime signature).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  link: (node: any, children: any, _parent: any, styles: any, onLinkPress: ((url: string) => boolean) | undefined) => {
    const href: string = node?.attributes?.href ?? "";
    const isWiki = href.startsWith("#wiki:");
    const isBroken = href.startsWith("#wiki-broken:");
    const isTaskEmpty = href.startsWith("#task-empty:");
    const isTaskDone = href.startsWith("#task-done:");
    const isTask = isTaskEmpty || isTaskDone;
    const onPress = () => {
      if (onLinkPress) {
        const shouldOpenExternally = onLinkPress(href);
        if (shouldOpenExternally && href) Linking.openURL(href);
      } else if (href) {
        Linking.openURL(href);
      }
    };
    if (isTask) {
      // Task checkbox: render the glyph children with a slightly
      // larger size + theme-tinted color, no underline. The
      // glyph itself comes from markTasks (☐ for empty, ☑ for
      // done) so we just lean on the rendered children rather
      // than re-deriving from the URL. `hitSlop`-equivalent isn't
      // available on Text — the glyph itself is ~18pt which gives
      // a reasonable tap area; expand later if user feedback
      // requests it.
      return React.createElement(
        Text,
        {
          key: node.key,
          style: [
            isTaskDone
              ? styles.link
              : (styles.link_task_empty ?? styles.link),
            { fontSize: 18 },
          ],
          onPress,
          accessibilityRole: "checkbox" as const,
          accessibilityState: { checked: isTaskDone },
        },
        children,
      );
    }
    const style = isWiki
      ? [styles.link, WIKI_DECOR]
      : isBroken
        ? [styles.link_wiki_broken ?? styles.link, WIKI_DECOR]
        : styles.link;
    return React.createElement(
      Text,
      { key: node.key, style, onPress },
      children,
    );
  },
  // Wrap tables in a horizontal ScrollView so wide tables (more
  // columns than fit on screen) scroll instead of forcing each
  // cell to wrap its text. `flexGrow: 1` on the contentContainer
  // keeps simple tables filling the viewport — without it, narrow
  // tables would shrink to their natural content width and leave
  // dead space on the right. GFM column alignment is preserved by
  // the library via `node.attributes.style` cascading down to
  // inner Text nodes through `inheritedStyles`, so it survives
  // this wrap untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: (node: any, children: any, _parent: any, styles: any) =>
    React.createElement(
      ScrollView,
      {
        key: node.key,
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        contentContainerStyle: { flexGrow: 1 },
      },
      React.createElement(View, { style: styles._VIEW_SAFE_table }, children),
    ),
  // th / td get a minWidth so the row's natural width grows with
  // column count. When total minWidth exceeds the viewport, the
  // ScrollView around the table starts scrolling. Below that, the
  // outer container's flexGrow:1 inflates the row and `flex: 1` on
  // each cell still divides the available space evenly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  th: (node: any, children: any, _parent: any, styles: any) =>
    React.createElement(
      View,
      {
        key: node.key,
        style: [styles._VIEW_SAFE_th, { minWidth: TABLE_CELL_MIN_WIDTH }],
      },
      children,
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  td: (node: any, children: any, _parent: any, styles: any) =>
    React.createElement(
      View,
      {
        key: node.key,
        style: [styles._VIEW_SAFE_td, { minWidth: TABLE_CELL_MIN_WIDTH }],
      },
      children,
    ),
  // Fenced code blocks (```lang … ```) and indented code blocks
  // wrap their content Text in a horizontal ScrollView so long
  // lines scroll horizontally instead of wrapping mid-line. The
  // bordered chrome (bg, border, padding, radius) lives on the
  // ScrollView; the inner Text inherits color/font from the body
  // style cascade, which is why we don't pass `styles.fence` /
  // `styles.code_block` on the Text — applying them there would
  // double-apply padding inside the already-padded container.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fence: (node: any, _children: any, _parent: any, styles: any, inheritedStyles: any = {}) => {
    let content = node.content;
    if (typeof content === "string" && content.endsWith("\n")) {
      content = content.slice(0, -1);
    }
    return React.createElement(
      ScrollView,
      {
        key: node.key,
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        style: styles._VIEW_SAFE_fence,
      },
      React.createElement(Text, { style: inheritedStyles }, content),
    );
  },
  // Heading rules (h1–h6) wrap children in a HeadingCapture that
  // reports the heading's rendered Y back to the host screen via
  // TocCaptureContext. Visual styling stays in the screens' mdStyles
  // (heading1 etc.) — we just adopt that style on the capturing
  // wrapper instead of an extra inner Text wrapper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heading1: (node: any, children: any, _parent: any, styles: any) =>
    headingRule("heading1", node, children, styles),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heading2: (node: any, children: any, _parent: any, styles: any) =>
    headingRule("heading2", node, children, styles),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heading3: (node: any, children: any, _parent: any, styles: any) =>
    headingRule("heading3", node, children, styles),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heading4: (node: any, children: any, _parent: any, styles: any) =>
    headingRule("heading4", node, children, styles),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heading5: (node: any, children: any, _parent: any, styles: any) =>
    headingRule("heading5", node, children, styles),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heading6: (node: any, children: any, _parent: any, styles: any) =>
    headingRule("heading6", node, children, styles),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code_block: (node: any, _children: any, _parent: any, styles: any, inheritedStyles: any = {}) => {
    let content = node.content;
    if (typeof content === "string" && content.endsWith("\n")) {
      content = content.slice(0, -1);
    }
    return React.createElement(
      ScrollView,
      {
        key: node.key,
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        style: styles._VIEW_SAFE_code_block,
      },
      React.createElement(Text, { style: inheritedStyles }, content),
    );
  },
};
