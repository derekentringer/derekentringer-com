import React from "react";
// react-native-markdown-display's default `image` rule does
// `<FitImage {...imageProps} />` where `imageProps.key = node.key`,
// which trips React 18+'s "key passed via spread" warning. We
// override with our own rule that extracts the key and passes it
// directly to JSX. Same FitImage component, same behavior — just
// without the spread-key shape.
import FitImage from "react-native-fit-image";

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
};
