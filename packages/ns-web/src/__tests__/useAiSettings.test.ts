import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiSettings } from "../hooks/useAiSettings.ts";

beforeEach(() => {
  localStorage.clear();
});

describe("useAiSettings", () => {
  const DEFAULT_AUTO_APPROVE = {
    deleteNote: false,
    deleteFolder: false,
    updateNoteContent: false,
    renameFolder: false,
    renameTag: false,
  };

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
      audioMode: "meeting",
      qaAssistant: false,
      autoApprove: DEFAULT_AUTO_APPROVE,
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
      qaAssistant: true,
      autoApprove: DEFAULT_AUTO_APPROVE,
    });
  });

  it("reads completionStyle from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        completions: true,
        completionStyle: "brief",
        summarize: false,
        tagSuggestions: false,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionStyle).toBe("brief");
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

  it("updateSetting persists completionStyle to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("completionStyle", "brief");
    });

    expect(result.current.settings.completionStyle).toBe("brief");

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completionStyle).toBe("brief");
  });

  it("updateSetting persists semanticSearch to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("semanticSearch", true);
    });

    expect(result.current.settings.semanticSearch).toBe(true);

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.semanticSearch).toBe(true);
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
        qaAssistant: false,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("summarize", true);
    });

    expect(result.current.settings).toEqual({
      masterAiEnabled: true,
      completions: true,
      completionStyle: "markdown",
      completionDebounceMs: 600,
      continueWriting: false,
      summarize: true,
      tagSuggestions: true,
      rewrite: true,
      semanticSearch: true,
      audioNotes: false,
      audioMode: "memo",
      qaAssistant: false,
      autoApprove: DEFAULT_AUTO_APPROVE,
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
      audioMode: "meeting",
      qaAssistant: false,
      autoApprove: DEFAULT_AUTO_APPROVE,
    });
  });

  it("handles partial localStorage values gracefully", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ completions: true }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      masterAiEnabled: true,
      completions: true,
      completionStyle: "continue",
      completionDebounceMs: 600,
      continueWriting: false,
      summarize: false,
      tagSuggestions: false,
      rewrite: false,
      semanticSearch: false,
      audioNotes: false,
      audioMode: "meeting",
      qaAssistant: false,
      autoApprove: DEFAULT_AUTO_APPROVE,
    });
  });

  it("defaults invalid completionStyle to continue", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        completions: true,
        completionStyle: "invalid-value",
        summarize: false,
        tagSuggestions: false,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionStyle).toBe("continue");
  });

  it("reads audioMode from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        audioNotes: true,
        audioMode: "meeting",
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.audioMode).toBe("meeting");
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

    expect(result.current.settings.audioMode).toBe("meeting");
  });

  it("updateSetting persists audioMode to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("audioMode", "lecture");
    });

    expect(result.current.settings.audioMode).toBe("lecture");

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.audioMode).toBe("lecture");
  });

  it("defaults qaAssistant to false", () => {
    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.qaAssistant).toBe(false);
  });

  it("reads qaAssistant from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        qaAssistant: true,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.qaAssistant).toBe(true);
  });

  it("updateSetting persists qaAssistant to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("qaAssistant", true);
    });

    expect(result.current.settings.qaAssistant).toBe(true);

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.qaAssistant).toBe(true);
  });

  // --- masterAiEnabled ---

  it("defaults masterAiEnabled to true", () => {
    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.masterAiEnabled).toBe(true);
  });

  it("reads masterAiEnabled from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ masterAiEnabled: false }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.masterAiEnabled).toBe(false);
  });

  it("updateSetting persists masterAiEnabled to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("masterAiEnabled", false);
    });

    expect(result.current.settings.masterAiEnabled).toBe(false);

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.masterAiEnabled).toBe(false);
  });

  // --- completionDebounceMs ---

  it("defaults completionDebounceMs to 600", () => {
    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionDebounceMs).toBe(600);
  });

  it("reads completionDebounceMs from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ completionDebounceMs: 1000 }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings.completionDebounceMs).toBe(1000);
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

  it("updateSetting persists completionDebounceMs to localStorage", () => {
    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("completionDebounceMs", 800);
    });

    expect(result.current.settings.completionDebounceMs).toBe(800);

    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.completionDebounceMs).toBe(800);
  });

  // Phase C.5 — autoApprove sub-settings load with sensible defaults
  // and persist correctly when individual flags toggle.
  it("loads autoApprove from localStorage with defaults for missing flags", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        autoApprove: { deleteNote: true }, // partial
      }),
    );
    const { result } = renderHook(() => useAiSettings());
    expect(result.current.settings.autoApprove).toEqual({
      deleteNote: true,
      deleteFolder: false,
      updateNoteContent: false,
      renameFolder: false,
      renameTag: false,
    });
  });

  it("rejects malformed autoApprove gracefully", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ autoApprove: "not-an-object" }),
    );
    const { result } = renderHook(() => useAiSettings());
    expect(result.current.settings.autoApprove).toEqual(DEFAULT_AUTO_APPROVE);
  });

  it("updateSetting persists autoApprove changes", () => {
    const { result } = renderHook(() => useAiSettings());
    act(() => {
      result.current.updateSetting("autoApprove", {
        ...result.current.settings.autoApprove,
        deleteFolder: true,
      });
    });
    expect(result.current.settings.autoApprove.deleteFolder).toBe(true);
    const stored = JSON.parse(localStorage.getItem("ns-ai-settings")!);
    expect(stored.autoApprove.deleteFolder).toBe(true);
  });
});
