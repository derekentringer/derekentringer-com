import React from "react";
import { Linking, Platform, Text } from "react-native";
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
};
