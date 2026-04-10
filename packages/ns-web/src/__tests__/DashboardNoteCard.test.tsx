import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@derekentringer/shared/ns";
import { DashboardNoteCard } from "../components/DashboardNoteCard.tsx";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test Note",
    content: "Some plain text content here for preview.",
    folder: null,
    folderId: null,
    folderPath: null,
    tags: [],
    summary: null,
    favorite: false,
    sortOrder: 0,
    favoriteSortOrder: 0,
    isLocalFile: false,
    audioMode: null,
    transcript: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    deletedAt: null,
    ...overrides,
  };
}

describe("DashboardNoteCard", () => {
  const defaultOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title, truncated content preview, and relative date", () => {
    const note = makeNote({
      title: "My Important Note",
      content: "This is the body of the note that will be previewed.",
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={defaultOnClick} />,
    );

    expect(screen.getByText("My Important Note")).toBeInTheDocument();
    expect(
      screen.getByText("This is the body of the note that will be previewed."),
    ).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
  });

  it("renders tags as pills (max 3 with overflow count)", () => {
    const note = makeNote({
      tags: ["react", "typescript", "vitest", "testing", "frontend"],
    });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={defaultOnClick} />,
    );

    // First 3 tags visible
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("vitest")).toBeInTheDocument();

    // Tags beyond 3 not rendered individually
    expect(screen.queryByText("testing")).not.toBeInTheDocument();
    expect(screen.queryByText("frontend")).not.toBeInTheDocument();

    // Overflow count shown (+2)
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders hero variant with wider layout", () => {
    const note = makeNote();

    const { container } = render(
      <DashboardNoteCard note={note} variant="hero" onClick={defaultOnClick} />,
    );

    const button = container.querySelector("button");
    expect(button).toHaveClass("w-full");
    expect(button).not.toHaveClass("w-[220px]");
  });

  it("calls onClick with noteId when clicked", async () => {
    const note = makeNote({ id: "note-42" });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={defaultOnClick} />,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(defaultOnClick).toHaveBeenCalledTimes(1);
    expect(defaultOnClick).toHaveBeenCalledWith("note-42");
  });

  it("has cursor-pointer class", () => {
    const note = makeNote();

    const { container } = render(
      <DashboardNoteCard note={note} variant="default" onClick={defaultOnClick} />,
    );

    const button = container.querySelector("button");
    expect(button).toHaveClass("cursor-pointer");
  });

  it("strips markdown from content preview", () => {
    const note = makeNote({
      content:
        "# Heading\n\n**Bold text** and *italic text* with `inline code` and [a link](https://example.com).\n\n- list item\n> blockquote",
    });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={defaultOnClick} />,
    );

    // Markdown syntax should be stripped; plain text remains
    const preview = screen.getByText(/Bold text and italic text/);
    expect(preview).toBeInTheDocument();

    // Should not contain raw markdown markers
    expect(preview.textContent).not.toContain("**");
    expect(preview.textContent).not.toContain("# ");
    expect(preview.textContent).not.toContain("`");
    expect(preview.textContent).not.toContain("[a link](");
  });
});
