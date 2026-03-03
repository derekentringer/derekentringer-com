/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react-native$": "<rootDir>/src/__mocks__/react-native.js",
    "^@expo/vector-icons$": "<rootDir>/src/__mocks__/@expo/vector-icons.js",
    "^react-native-svg$": "<rootDir>/src/__mocks__/react-native-svg.js",
  },

  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
  },

  transformIgnorePatterns: [
    "node_modules/(?!(@react-navigation|@tanstack|zustand|@derekentringer|expo.*|react-native.*|@expo.*|@babel/runtime)/)",
  ],

  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)",
  ],

  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
    "!src/**/__tests__/**/*",
    "!src/**/__mocks__/**/*",
  ],

  clearMocks: true,
  collectCoverage: false,
  verbose: true,

  globals: {
    __DEV__: true,
  },
};
