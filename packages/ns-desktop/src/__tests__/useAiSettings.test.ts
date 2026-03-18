import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiSettings } from "../hooks/useAiSettings.ts";

beforeEach(() => {
  localStorage.clear();
});

describe("useAiSettings", () => {
  it("returns defaults when no localStorage value", () => {
    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      masterAiEnabled: true,
      completions: false,
      completionStyle: "continue",
      completionDebounceMs: 600,
      continueWriting: false,
      summarize: false,
      tagSuggestions: false,
      rewrite: false,
      semanticSearch: false,
      audioNotes: false,
      audioMode: "memo",
      recordingSource: "microphone",
      qaAssistant: false,
    });
  });

  it("reads existing settings from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        masterAiEnabled: false,
        completions: true,
        completionStyle: "markdown",
        completionDebounceMs: 400,
        summarize: true,
        tagSuggestions: false,
        rewrite: true,
        semanticSearch: true,
        audioNotes: true,
        audioMode: "lecture",
        recordingSource: "meeting",
        qaAssistant: true,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      masterAiEnabled: false,
      completions: true,
      completionStyle: "markdown",
      completionDebounceMs: 400,
      continueWriting: false,
      summarize: true,
      tagSuggestions: false,
      rewrite: true,
      semanticSearch: true,
      audioNotes: true,
      audioMode: "lecture",
      recordingSource: "meeting",
      qaAssistant: true,
    });
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("ns-ai-settings", "not-json");

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      masterAiEnabled: true,
      completions: false,
      completionStyle: "continue",
      completionDebounceMs: 600,
      continueWriting: false,
      summarize: false,
      tagSuggestions: false,
      rewrite: false,
      semanticSearch: false,
      audioNotes: false,
      audioMode: "memo",
      recordingSource: "microphone",
      qaAssistant: false,
    });
  });

  it("handles partial localStorage values gracefully", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ completions: true }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completions).toBe(true);
    expect(result.current.settings.masterAiEnabled).toBe(true);
    expect(result.current.settings.completionStyle).toBe("continue");
    expect(result.current.settings.recordingSource).toBe("microphone");
  });

  it("updateSetting persists changes to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("completions", true);
    });

    expect(result.current.settings.completions).toBe(true);

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completions).toBe(true);
  });

  it("updateSetting preserves other settings", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        masterAiEnabled: true,
        completions: true,
        completionStyle: "markdown",
        completionDebounceMs: 600,
        continueWriting: false,
        summarize: false,
        tagSuggestions: true,
        rewrite: true,
        semanticSearch: true,
        audioNotes: false,
        audioMode: "memo",
        recordingSource: "microphone",
        qaAssistant: false,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("summarize", true);
    });

    expect(result.current.settings.summarize).toBe(true);
    expect(result.current.settings.completions).toBe(true);
    expect(result.current.settings.completionStyle).toBe("markdown");
    expect(result.current.settings.tagSuggestions).toBe(true);
  });

  it("defaults invalid completionStyle to continue", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        completions: true,
        completionStyle: "invalid-value",
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionStyle).toBe("continue");
  });

  it("defaults invalid audioMode to memo", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        audioNotes: true,
        audioMode: "invalid-mode",
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.audioMode).toBe("memo");
  });

  it("defaults invalid recordingSource to microphone", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        audioNotes: true,
        recordingSource: "invalid-source",
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.recordingSource).toBe("microphone");
  });

  it("clamps completionDebounceMs to valid range", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ completionDebounceMs: 50 }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionDebounceMs).toBe(200);
  });

  it("clamps completionDebounceMs upper bound", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ completionDebounceMs: 3000 }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionDebounceMs).toBe(1500);
  });

  it("all 13 fields are present in defaults", () => {
    const { result } = renderHook(() => useAiSettings());

    const keys = Object.keys(result.current.settings);
    expect(keys).toContain("masterAiEnabled");
    expect(keys).toContain("completions");
    expect(keys).toContain("completionStyle");
    expect(keys).toContain("completionDebounceMs");
    expect(keys).toContain("continueWriting");
    expect(keys).toContain("summarize");
    expect(keys).toContain("tagSuggestions");
    expect(keys).toContain("rewrite");
    expect(keys).toContain("semanticSearch");
    expect(keys).toContain("audioNotes");
    expect(keys).toContain("audioMode");
    expect(keys).toContain("recordingSource");
    expect(keys).toContain("qaAssistant");
    expect(keys.length).toBe(13);
  });

  it("persists recordingSource changes", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("recordingSource", "meeting");
    });

    expect(result.current.settings.recordingSource).toBe("meeting");

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.recordingSource).toBe("meeting");
  });
});
