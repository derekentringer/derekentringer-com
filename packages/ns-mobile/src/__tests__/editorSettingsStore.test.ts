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

  it("theme defaults to 'system' (follow OS)", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("system");
  });

  it("accentColor defaults to 'lime' to match web/desktop", () => {
    expect(DEFAULT_SETTINGS.accentColor).toBe("lime");
  });

  it("editorFontSize defaults to 14 to match web/desktop", () => {
    expect(DEFAULT_SETTINGS.editorFontSize).toBe(14);
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
      { ...DEFAULT_SETTINGS, propertiesMode: "source" },
    );
  });

  it("falls back to 'panel' for an unknown mode value", () => {
    expect(parseSettings(JSON.stringify({ propertiesMode: "bogus" }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("accepts 'dark' / 'light' / 'teams' theme values and falls back on bogus", () => {
    expect(parseSettings(JSON.stringify({ theme: "dark" })).theme).toBe("dark");
    expect(parseSettings(JSON.stringify({ theme: "light" })).theme).toBe(
      "light",
    );
    expect(parseSettings(JSON.stringify({ theme: "teams" })).theme).toBe(
      "teams",
    );
    expect(parseSettings(JSON.stringify({ theme: "bogus" })).theme).toBe(
      DEFAULT_SETTINGS.theme,
    );
  });

  it("clamps editorFontSize into the 10–24 range", () => {
    expect(
      parseSettings(JSON.stringify({ editorFontSize: 5 })).editorFontSize,
    ).toBe(10);
    expect(
      parseSettings(JSON.stringify({ editorFontSize: 99 })).editorFontSize,
    ).toBe(24);
    expect(
      parseSettings(JSON.stringify({ editorFontSize: 18 })).editorFontSize,
    ).toBe(18);
  });

  it("accepts known accent presets and falls back on unknown", () => {
    expect(
      parseSettings(JSON.stringify({ accentColor: "purple" })).accentColor,
    ).toBe("purple");
    expect(
      parseSettings(JSON.stringify({ accentColor: "bogus" })).accentColor,
    ).toBe(DEFAULT_SETTINGS.accentColor);
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
    // Last persist serializes the full settings shape — check just
    // the field that matters for this test so the assertion isn't
    // brittle as new fields are added.
    const [, lastJson] = mockSet.mock.calls[mockSet.mock.calls.length - 1];
    expect(JSON.parse(lastJson as string).propertiesMode).toBe("panel");
  });
});
