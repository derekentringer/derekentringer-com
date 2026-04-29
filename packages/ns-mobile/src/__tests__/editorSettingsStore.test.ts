// Tests for the mobile editor settings Zustand store. Covers
// default shape, parseSettings tolerance, hydration from
// AsyncStorage, and the toggle action.

import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGet = jest.fn();
const mockSet = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGet(...args),
    setItem: (...args: unknown[]) => mockSet(...args),
  },
}));

void AsyncStorage;

import useEditorSettingsStore, {
  DEFAULT_SETTINGS,
  parseSettings,
} from "../store/editorSettingsStore";

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue(undefined);
  useEditorSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    isLoaded: false,
  });
});

describe("default settings", () => {
  it("propertiesMode defaults to 'panel' (frontmatter hidden) — matches web", () => {
    expect(DEFAULT_SETTINGS.propertiesMode).toBe("panel");
  });
});

describe("parseSettings", () => {
  it("returns defaults for null / empty input", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for malformed JSON", () => {
    expect(parseSettings("not-json")).toEqual(DEFAULT_SETTINGS);
  });

  it("accepts 'source' and round-trips it", () => {
    expect(parseSettings(JSON.stringify({ propertiesMode: "source" }))).toEqual(
      { propertiesMode: "source" },
    );
  });

  it("falls back to 'panel' for an unknown mode value", () => {
    expect(parseSettings(JSON.stringify({ propertiesMode: "bogus" }))).toEqual(
      { propertiesMode: "panel" },
    );
  });
});

describe("hydrate", () => {
  it("loads settings from AsyncStorage and flips isLoaded", async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ propertiesMode: "source" }));
    await useEditorSettingsStore.getState().hydrate();
    expect(useEditorSettingsStore.getState().propertiesMode).toBe("source");
    expect(useEditorSettingsStore.getState().isLoaded).toBe(true);
  });

  it("falls back to defaults if AsyncStorage throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("nope"));
    await useEditorSettingsStore.getState().hydrate();
    expect(useEditorSettingsStore.getState().propertiesMode).toBe("panel");
    expect(useEditorSettingsStore.getState().isLoaded).toBe(true);
  });
});

describe("togglePropertiesMode", () => {
  it("flips panel ↔ source and persists each change", async () => {
    const { togglePropertiesMode } = useEditorSettingsStore.getState();

    togglePropertiesMode();
    expect(useEditorSettingsStore.getState().propertiesMode).toBe("source");

    togglePropertiesMode();
    expect(useEditorSettingsStore.getState().propertiesMode).toBe("panel");

    // Wait a tick so the void-fired persist promises settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenLastCalledWith(
      "ns-editor-settings",
      JSON.stringify({ propertiesMode: "panel" }),
    );
  });
});
