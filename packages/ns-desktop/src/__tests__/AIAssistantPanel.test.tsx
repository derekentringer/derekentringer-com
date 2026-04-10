import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIAssistantPanel } from "../components/AIAssistantPanel.tsx";
import type { AskQuestionEvent } from "../api/ai.ts";

const mockAskQuestion = vi.fn();

vi.mock("../api/ai.ts", () => ({
  askQuestion: (...args: unknown[]) => mockAskQuestion(...args),
  fetchChatHistory: () => Promise.resolve([]),
  saveChatMessages: () => Promise.resolve(),
  clearServerChatHistory: () => Promise.resolve(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // scrollIntoView is not implemented in jsdom
  Element.prototype.scrollIntoView = vi.fn();
});

describe("AIAssistantPanel", () => {
  it("renders Clear button when messages exist", async () => {
    mockAskQuestion.mockImplementation(async function* (): AsyncGenerator<AskQuestionEvent> {
      yield { text: "Hello" };
    });

    render(<AIAssistantPanel onSelectNote={vi.fn()} isOpen={true} />);

    const input = screen.getByPlaceholderText("Ask anything about your notes...");
    await userEvent.type(input, "test");
    await userEvent.click(screen.getByText("Ask"));

    await waitFor(() => {
      expect(screen.getByText("Clear")).toBeInTheDocument();
    });
  });

  it("Ask button disabled when input is empty", () => {
    render(<AIAssistantPanel onSelectNote={vi.fn()} isOpen={true} />);

    const askButton = screen.getByText("Ask");
    expect(askButton).toBeDisabled();
  });

  it("Ask button enabled when input has text", async () => {
    render(<AIAssistantPanel onSelectNote={vi.fn()} isOpen={true} />);

    const input = screen.getByPlaceholderText("Ask anything about your notes...");
    await userEvent.type(input, "What is React?");

    const askButton = screen.getByText("Ask");
    expect(askButton).toBeEnabled();
  });

  it("calls onSelectNote when source pill is clicked", async () => {
    const onSelectNote = vi.fn();

    // Mock askQuestion to return an async generator that yields sources then text
    mockAskQuestion.mockImplementation(async function* (): AsyncGenerator<AskQuestionEvent> {
      yield { sources: [{ id: "note-1", title: "React Basics" }] };
      yield { text: "React is a library. [React Basics]" };
    });

    render(<AIAssistantPanel onSelectNote={onSelectNote} isOpen={true} />);

    const input = screen.getByPlaceholderText("Ask anything about your notes...");
    await userEvent.type(input, "What is React?");

    const askButton = screen.getByText("Ask");
    await userEvent.click(askButton);

    // Wait for source pill to appear
    const sourcePill = await screen.findByText("React Basics");
    await userEvent.click(sourcePill);

    expect(onSelectNote).toHaveBeenCalledWith("note-1");
  });
});
