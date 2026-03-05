import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorSettings } from "../hooks/useEditorSettings.ts";

beforeEach(() => {
  localStorage.clear();
});

describe("useEditorSettings", () => {
  it("returns defaults when no localStorage value", () => {
    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual({
      defaultViewMode: "editor",
      showLineNumbers: true,
      wordWrap: true,
      autoSaveDelay: 1500,
      tabSize: 2,
      theme: "dark",
      editorFontSize: 14,
      maxCachedNotes: 100,
      accentColor: "lime",
    });
  });

  it("reads existing settings from localStorage", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({
        defaultViewMode: "split",
        showLineNumbers: false,
        wordWrap: false,
        autoSaveDelay: 2000,
        tabSize: 4,
        theme: "light",
        editorFontSize: 16,
        maxCachedNotes: 200,
        accentColor: "blue",
      }),
    );

    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual({
      defaultViewMode: "split",
      showLineNumbers: false,
      wordWrap: false,
      autoSaveDelay: 2000,
      tabSize: 4,
      theme: "light",
      editorFontSize: 16,
      maxCachedNotes: 200,
      accentColor: "blue",
    });
  });

  it("updateSetting persists changes to localStorage", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("theme", "light");
    });

    expect(result.current.settings.theme).toBe("light");

    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.theme).toBe("light");
  });

  it("updateSetting preserves other settings", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({
        defaultViewMode: "split",
        showLineNumbers: false,
        wordWrap: true,
        autoSaveDelay: 2000,
        tabSize: 4,
        theme: "dark",
        editorFontSize: 16,
        maxCachedNotes: 200,
      }),
    );

    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("theme", "system");
    });

    expect(result.current.settings).toEqual({
      defaultViewMode: "split",
      showLineNumbers: false,
      wordWrap: true,
      autoSaveDelay: 2000,
      tabSize: 4,
      theme: "system",
      editorFontSize: 16,
      maxCachedNotes: 200,
      accentColor: "lime",
    });
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("ns-editor-settings", "not-json");

    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual({
      defaultViewMode: "editor",
      showLineNumbers: true,
      wordWrap: true,
      autoSaveDelay: 1500,
      tabSize: 2,
      theme: "dark",
      editorFontSize: 14,
      maxCachedNotes: 100,
      accentColor: "lime",
    });
  });

  it("handles partial localStorage values gracefully", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ theme: "light" }),
    );

    const { result } = renderHook(() => useEditorSettings());

    expect(result.current.settings).toEqual({
      defaultViewMode: "editor",
      showLineNumbers: true,
      wordWrap: true,
      autoSaveDelay: 1500,
      tabSize: 2,
      theme: "light",
      editorFontSize: 14,
      maxCachedNotes: 100,
      accentColor: "lime",
    });
  });

  it("defaults invalid viewMode to editor", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ defaultViewMode: "invalid" }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.defaultViewMode).toBe("editor");
  });

  it("defaults invalid theme to dark", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ theme: "neon" }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.theme).toBe("dark");
  });

  it("defaults invalid tabSize to 2", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ tabSize: 8 }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.tabSize).toBe(2);
  });

  it("clamps autoSaveDelay to valid range", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ autoSaveDelay: 100 }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.autoSaveDelay).toBe(500);
  });

  it("clamps editorFontSize to valid range", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ editorFontSize: 30 }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.editorFontSize).toBe(24);
  });

  it("clamps maxCachedNotes to valid range", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ maxCachedNotes: 5 }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.maxCachedNotes).toBe(10);
  });

  it("defaults accentColor to lime", () => {
    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.accentColor).toBe("lime");
  });

  it("persists accentColor to localStorage", () => {
    const { result } = renderHook(() => useEditorSettings());

    act(() => {
      result.current.updateSetting("accentColor", "blue");
    });

    expect(result.current.settings.accentColor).toBe("blue");

    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.accentColor).toBe("blue");
  });

  it("defaults invalid accentColor to lime", () => {
    localStorage.setItem(
      "ns-editor-settings",
      JSON.stringify({ accentColor: "neon" }),
    );

    const { result } = renderHook(() => useEditorSettings());
    expect(result.current.settings.accentColor).toBe("lime");
  });
});
