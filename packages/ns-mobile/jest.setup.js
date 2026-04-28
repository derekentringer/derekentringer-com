// Mock expo-crypto
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "mock-uuid-" + Math.random().toString(36).slice(2, 10)),
}));

// Mock @react-native-community/netinfo
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-sqlite
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
  }),
}));

// Mock @react-navigation modules
jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }) => children,
  useNavigation: jest.fn().mockReturnValue({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
  }),
  useRoute: jest.fn().mockReturnValue({
    params: {},
  }),
}));

// Mock @expo/vector-icons — its real import pulls in expo-font /
// expo-modules-core which require a native EventEmitter that's
// unavailable in jsdom. Tests don't render icons; a stub is enough.
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "MaterialCommunityIcons");
jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () => ({
  default: {
    call: () => {},
    createAnimatedComponent: (component) => component,
    Value: jest.fn(),
    event: jest.fn(),
  },
  useSharedValue: jest.fn(),
  useAnimatedStyle: jest.fn(),
  withTiming: jest.fn(),
  withSpring: jest.fn(),
  withRepeat: jest.fn(),
  Easing: { linear: jest.fn() },
}));

// Suppress require cycle warnings
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.("Require cycle")) return;
  originalConsoleWarn(...args);
};

global.__DEV__ = true;
