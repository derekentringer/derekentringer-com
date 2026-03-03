module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./src",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
    env: {
      test: {
        presets: [
          ["babel-preset-expo", { jsxRuntime: "automatic" }],
          ["@babel/preset-typescript", { jsxPragma: "React" }],
        ],
      },
    },
  };
};
