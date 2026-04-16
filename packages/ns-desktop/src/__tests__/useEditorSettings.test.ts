import { renderHook, act } from "@testing-library/react";
import {
  useEditorSettings,
  resolveAccentColor,
  ACCENT_PRESETS,
  type EditorSettings,
} from "../hooks/useEditorSettings.ts";

const STORAGE_KEY = "ns-editor-settings";

beforeEach(() => {
  localStorage.clear();
});

describe("useEditorSettings", () => {
  it("returns default settings when localStorage is empty", () => {
    const { result } = renderHook(() => useEditorSettings());
    const { settings } = result.current;

    expect(settings.defaultViewMode).toBe("editor");
    expect(settings.showLineNumbers).toBe(true);
    expect(settings.wordWrap).toBe(true);
    expect(settings.autoSaveDelay).toBe(1500);
    expect(settings.tabSize).toBe(2);
    expect(settings.theme).toBe("dark");
    expect(settings.editorFontSize).toBe(14);
    expect(settings.maxCachedNotes).toBe(100);
    expect(settings.accentColor).toBe("lime");
    expect(settings.cursorStyle).toBe("line");
    expect(settings.cursorBlink).toBe(true);
    expect(settings.versionIntervalMinutes).toBe(0);
  });

  it("loads saved settings from localStorage", () => {
    const saved: EditorSettings = {
      defaultViewMode: "split",
      showLineNumbers: false,
      propertiesMode: "source",
      propertiesCollapsed: true,
      wordWrap: false,
      autoSaveDelay: 2000,
      tabSize: 4,
      theme: "light",
      editorFontSize: 16,
      maxCachedNotes: 50,
      accentColor: "blue",
      customAccentColor: "#d4e157",
      cursorStyle: "block",
      cursorBlink: false,
      versionIntervalMinutes: 5,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings).toEqual(saved);
  });

  it("updates a setting and persists to localStorage", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("theme", "light");
    });

    expect(result.current.settings.theme).toBe("light");

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.theme).toBe("light");
  });

  it("clamps autoSaveDelay to valid range (500-5000)", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ autoSaveDelay: 100 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.autoSaveDelay).toBe(500);
  });

  it("clamps autoSaveDelay above max to 5000", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ autoSaveDelay: 10000 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.autoSaveDelay).toBe(5000);
  });

  it("clamps editorFontSize to valid range (10-24)", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ editorFontSize: 5 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.editorFontSize).toBe(10);
  });

  it("clamps maxCachedNotes to valid range (10-500)", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ maxCachedNotes: 1000 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.maxCachedNotes).toBe(500);
  });

  it("returns default versionIntervalMinutes of 0", () => {
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.versionIntervalMinutes).toBe(0);
  });

  it("persists versionIntervalMinutes", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("versionIntervalMinutes", 5);
    });

    expect(result.current.settings.versionIntervalMinutes).toBe(5);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.versionIntervalMinutes).toBe(5);
  });

  it("clamps versionIntervalMinutes below min to 0", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ versionIntervalMinutes: -5 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.versionIntervalMinutes).toBe(0);
  });

  it("clamps versionIntervalMinutes above max to 60", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ versionIntervalMinutes: 120 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.versionIntervalMinutes).toBe(60);
  });

  it("allows versionIntervalMinutes of 0 (every save)", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ versionIntervalMinutes: 0 }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.versionIntervalMinutes).toBe(0);
  });

  it("falls back to defaults for invalid enum values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        defaultViewMode: "invalid",
        theme: "nope",
        tabSize: 8,
        accentColor: "neon",
      }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.defaultViewMode).toBe("editor");
    expect(result.current.settings.theme).toBe("dark");
    expect(result.current.settings.tabSize).toBe(2);
    expect(result.current.settings.accentColor).toBe("lime");
  });

  it("handles corrupted JSON in localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.defaultViewMode).toBe("editor");
  });

  it("defaults cursorStyle to line", () => {
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.cursorStyle).toBe("line");
  });

  it("defaults cursorBlink to true", () => {
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.cursorBlink).toBe(true);
  });

  it("persists cursorStyle to localStorage", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("cursorStyle", "underline");
    });

    expect(result.current.settings.cursorStyle).toBe("underline");

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.cursorStyle).toBe("underline");
  });

  it("persists cursorBlink to localStorage", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("cursorBlink", false);
    });

    expect(result.current.settings.cursorBlink).toBe(false);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.cursorBlink).toBe(false);
  });

  it("defaults invalid cursorStyle to line", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cursorStyle: "beam" }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.cursorStyle).toBe("line");
  });

  it("defaults non-boolean cursorBlink to true", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cursorBlink: "yes" }),
    );
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.cursorBlink).toBe(true);
  });

  it("accepts all valid cursorStyle values", () => {
    for (const style of ["line", "block", "underline"]) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cursorStyle: style }),
      );
      const { result } = renderHook(() => useEditorSettings());
      expect(result.current.settings.cursorStyle).toBe(style);
    }
  });
});

describe("resolveAccentColor", () => {
  it("returns correct dark color for lime preset", () => {
    expect(resolveAccentColor("lime", "dark")).toBe("#d4e157");
  });

  it("returns correct light color for lime preset", () => {
    expect(resolveAccentColor("lime", "light")).toBe("#7c8a00");
  });

  it("returns correct colors for all presets", () => {
    for (const [preset, colors] of Object.entries(ACCENT_PRESETS)) {
      expect(resolveAccentColor(preset as keyof typeof ACCENT_PRESETS, "dark")).toBe(colors.dark);
      expect(resolveAccentColor(preset as keyof typeof ACCENT_PRESETS, "light")).toBe(colors.light);
    }
  });
});
