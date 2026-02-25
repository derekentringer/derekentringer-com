// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
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
