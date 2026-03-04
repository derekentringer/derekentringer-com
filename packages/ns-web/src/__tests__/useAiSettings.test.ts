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
      completions: false,
      completionStyle: "continue",
      summarize: false,
      tagSuggestions: false,
      rewrite: false,
      semanticSearch: false,
    });
  });

  it("reads existing settings from localStorage", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({
        completions: true,
        completionStyle: "markdown",
        summarize: true,
        tagSuggestions: false,
        rewrite: true,
        semanticSearch: true,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      completions: true,
      completionStyle: "markdown",
      summarize: true,
      tagSuggestions: false,
      rewrite: true,
      semanticSearch: true,
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
        completions: true,
        completionStyle: "markdown",
        summarize: false,
        tagSuggestions: true,
        rewrite: true,
        semanticSearch: true,
      }),
    );

    const { result } = renderHook(() => useAiSettings());

    act(() => {
      result.current.updateSetting("summarize", true);
    });

    expect(result.current.settings).toEqual({
      completions: true,
      completionStyle: "markdown",
      summarize: true,
      tagSuggestions: true,
      rewrite: true,
      semanticSearch: true,
    });
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("ns-ai-settings", "not-json");

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      completions: false,
      completionStyle: "continue",
      summarize: false,
      tagSuggestions: false,
      rewrite: false,
      semanticSearch: false,
    });
  });

  it("handles partial localStorage values gracefully", () => {
    localStorage.setItem(
      "ns-ai-settings",
      JSON.stringify({ completions: true }),
    );

    const { result } = renderHook(() => useAiSettings());

    expect(result.current.settings).toEqual({
      completions: true,
      completionStyle: "continue",
      summarize: false,
      tagSuggestions: false,
      rewrite: false,
      semanticSearch: false,
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
});
