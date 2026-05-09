// Tests for the mobile AI settings Zustand store (Phase A.6).
// Covers default shape, hydration from AsyncStorage (with malformed
// payloads), and per-toggle persistence.

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

import useAiSettingsStore, {
  DEFAULT_AUTO_APPROVE,
  DEFAULT_SETTINGS,
  parseSettings,
} from "../store/aiSettingsStore";

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue(undefined);
  // Reset the store to defaults between tests so they don't bleed.
  useAiSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    isLoaded: false,
  });
});

describe("default settings", () => {
  it("conservative defaults — every auto-approve toggle is off", () => {
    expect(DEFAULT_AUTO_APPROVE).toEqual({
      deleteNote: false,
      deleteFolder: false,
      updateNoteContent: false,
      renameNote: false,
      renameFolder: false,
      renameTag: false,
    });
  });

  it("master + qa default to ON so the AI tab works on first run", () => {
    expect(DEFAULT_SETTINGS.masterAiEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.qaAssistant).toBe(true);
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

  it("returns defaults for non-object payload", () => {
    expect(parseSettings('"a string"')).toEqual(DEFAULT_SETTINGS);
  });

  it("preserves valid fields and falls back per-field for invalid ones", () => {
    const raw = JSON.stringify({
      masterAiEnabled: false,
      qaAssistant: "not a bool", // invalid → fallback true
      autoApprove: {
        deleteNote: true,
        deleteFolder: 1, // invalid → fallback false
      },
    });
    const parsed = parseSettings(raw);
    expect(parsed.masterAiEnabled).toBe(false);
    expect(parsed.qaAssistant).toBe(true); // fallback
    expect(parsed.autoApprove.deleteNote).toBe(true);
    expect(parsed.autoApprove.deleteFolder).toBe(false); // fallback
    // Other fields default to false
    expect(parsed.autoApprove.renameNote).toBe(false);
  });
});

describe("hydrate", () => {
  it("loads persisted settings from AsyncStorage", async () => {
    mockGet.mockResolvedValue(
      JSON.stringify({
        masterAiEnabled: false,
        qaAssistant: true,
        autoApprove: { deleteNote: true },
      }),
    );
    await useAiSettingsStore.getState().hydrate();
    const state = useAiSettingsStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.masterAiEnabled).toBe(false);
    expect(state.autoApprove.deleteNote).toBe(true);
  });

  it("survives AsyncStorage failures and still flips isLoaded", async () => {
    mockGet.mockRejectedValue(new Error("disk full"));
    await useAiSettingsStore.getState().hydrate();
    const state = useAiSettingsStore.getState();
    expect(state.isLoaded).toBe(true);
    // Defaults remain when hydrate can't read.
    expect(state.masterAiEnabled).toBe(true);
  });
});

describe("toggle persistence", () => {
  it("persists on every toggle change", async () => {
    const { setMasterAiEnabled, setAutoApprove } =
      useAiSettingsStore.getState();
    setMasterAiEnabled(false);
    setAutoApprove("deleteNote", true);
    setAutoApprove("renameFolder", true);

    // setItem is called per change. We don't assert exact count
    // because Zustand may batch differently in different runtimes.
    expect(mockSet).toHaveBeenCalled();

    // The most recent payload should reflect the latest state.
    const lastCall = mockSet.mock.calls[mockSet.mock.calls.length - 1];
    expect(lastCall[0]).toBe("ns-ai-settings");
    const written = JSON.parse(lastCall[1] as string);
    expect(written.masterAiEnabled).toBe(false);
    expect(written.autoApprove.deleteNote).toBe(true);
    expect(written.autoApprove.renameFolder).toBe(true);
  });
});

// Avoid the "test file imports an unused symbol" warning for
// AsyncStorage — the import is needed so the type is in scope for
// the mock. Reference it once.
describe("AsyncStorage mock smoke", () => {
  it("is accessible via the default export", () => {
    expect(AsyncStorage).toBeTruthy();
  });
});
