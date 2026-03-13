import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@derekentringer/ns-shared";
import { DashboardNoteCard } from "../components/DashboardNoteCard.tsx";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test Note",
    content: "Some content here for preview",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    deletedAt: null,
    ...overrides,
  };
}

describe("DashboardNoteCard", () => {
  let onClick: (noteId: string) => void;

  beforeEach(() => {
    onClick = vi.fn();
  });

  it("renders title, truncated content preview, and relative date", () => {
    const note = makeNote({
      title: "Meeting Notes",
      content: "Discussed the roadmap for Q3 and priorities",
      updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
    });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={onClick} />,
    );

    expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
    expect(
      screen.getByText("Discussed the roadmap for Q3 and priorities"),
    ).toBeInTheDocument();
    expect(screen.getByText("30m ago")).toBeInTheDocument();
  });

  it("renders tags as pills (max 3 with overflow count)", () => {
    const note = makeNote({
      tags: ["react", "typescript", "vitest", "testing", "frontend"],
    });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={onClick} />,
    );

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("vitest")).toBeInTheDocument();
    expect(screen.queryByText("testing")).not.toBeInTheDocument();
    expect(screen.queryByText("frontend")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders hero variant with wider layout", () => {
    const note = makeNote();

    const { container } = render(
      <DashboardNoteCard note={note} variant="hero" onClick={onClick} />,
    );

    const button = container.querySelector("button");
    expect(button).toBeInTheDocument();
    expect(button!.className).toContain("w-full");
    expect(button!.className).not.toContain("w-[220px]");
  });

  it("calls onClick with noteId when clicked", async () => {
    const note = makeNote({ id: "abc-123" });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={onClick} />,
    );

    await userEvent.click(screen.getByText("Test Note"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("abc-123");
  });

  it("has cursor-pointer class", () => {
    const note = makeNote();

    const { container } = render(
      <DashboardNoteCard note={note} variant="default" onClick={onClick} />,
    );

    const button = container.querySelector("button");
    expect(button).toBeInTheDocument();
    expect(button!.className).toContain("cursor-pointer");
  });

  it("strips markdown from content preview", () => {
    const note = makeNote({
      content:
        "# Heading\n\n**Bold text** and *italic text*\n\n- list item\n\n`code snippet`\n\n[link text](https://example.com)",
    });

    render(
      <DashboardNoteCard note={note} variant="default" onClick={onClick} />,
    );

    // Markdown syntax should be stripped
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    expect(screen.queryByText(/`code snippet`/)).not.toBeInTheDocument();

    // Plain text content should remain
    const preview = screen.getByText(/Bold text/);
    expect(preview).toBeInTheDocument();
    expect(preview.textContent).toContain("italic text");
    expect(preview.textContent).toContain("link text");
    expect(preview.textContent).not.toContain("https://example.com");
  });
});
