import React from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
// react-native-markdown-display's default `image` rule does
// `<FitImage {...imageProps} />` where `imageProps.key = node.key`,
// which trips React 18+'s "key passed via spread" warning. We
// override with our own rule that extracts the key and passes it
// directly to JSX. Same FitImage component, same behavior — just
// without the spread-key shape.
import FitImage from "react-native-fit-image";

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
  // Override the default link rule so wiki-links and broken
  // wiki-links get their own styling. Regular links keep
  // `styles.link` exactly as before (lime via themeColors.primary,
  // no underline). The handler mirrors the library's openUrl
  // helper inline (the lib's exported helper has a single-arg
  // type declaration that doesn't match its runtime signature).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  link: (node: any, children: any, _parent: any, styles: any, onLinkPress: ((url: string) => boolean) | undefined) => {
    const href: string = node?.attributes?.href ?? "";
    const isWiki = href.startsWith("#wiki:");
    const isBroken = href.startsWith("#wiki-broken:");
    const style = isWiki
      ? [styles.link, WIKI_DECOR]
      : isBroken
        ? [styles.link_wiki_broken ?? styles.link, WIKI_DECOR]
        : styles.link;
    const onPress = () => {
      if (onLinkPress) {
        const shouldOpenExternally = onLinkPress(href);
        if (shouldOpenExternally && href) Linking.openURL(href);
      } else if (href) {
        Linking.openURL(href);
      }
    };
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
