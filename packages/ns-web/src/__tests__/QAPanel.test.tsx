import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QAPanel } from "../components/QAPanel.tsx";
import type { AskQuestionEvent } from "../api/ai.ts";

const mockAskQuestion = vi.fn();

vi.mock("../api/ai.ts", () => ({
  askQuestion: (...args: unknown[]) => mockAskQuestion(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // scrollIntoView is not implemented in jsdom
  Element.prototype.scrollIntoView = vi.fn();
});

describe("QAPanel", () => {
  it("renders empty state with 'Ask a question about your notes'", () => {
    render(<QAPanel onSelectNote={vi.fn()} isOpen={true} onToggle={vi.fn()} />);

    expect(
      screen.getByText("Ask a question about your notes"),
    ).toBeInTheDocument();
  });

  it("renders 'Q&A Assistant' header", () => {
    render(<QAPanel onSelectNote={vi.fn()} isOpen={true} onToggle={vi.fn()} />);

    expect(screen.getByText("Q&A Assistant")).toBeInTheDocument();
  });

  it("Ask button disabled when input is empty", () => {
    render(<QAPanel onSelectNote={vi.fn()} isOpen={true} onToggle={vi.fn()} />);

    const askButton = screen.getByText("Ask");
    expect(askButton).toBeDisabled();
  });

  it("Ask button enabled when input has text", async () => {
    render(<QAPanel onSelectNote={vi.fn()} isOpen={true} onToggle={vi.fn()} />);

    const input = screen.getByPlaceholderText("Ask about your notes...");
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

    render(<QAPanel onSelectNote={onSelectNote} isOpen={true} onToggle={vi.fn()} />);

    const input = screen.getByPlaceholderText("Ask about your notes...");
    await userEvent.type(input, "What is React?");

    const askButton = screen.getByText("Ask");
    await userEvent.click(askButton);

    // Wait for source pill to appear
    const sourcePill = await screen.findByText("React Basics");
    await userEvent.click(sourcePill);

    expect(onSelectNote).toHaveBeenCalledWith("note-1");
  });
});
