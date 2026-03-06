import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffView } from "../components/DiffView.tsx";
import type { NoteVersion } from "@derekentringer/shared/ns";

const mockVersion: NoteVersion = {
  id: "v1",
  noteId: "n1",
  title: "Old Title",
  content: "line one\nline two\nline three",
  createdAt: "2025-01-01T00:00:00.000Z",
};

describe("DiffView", () => {
  it("renders unified diff with added/removed/same lines", () => {
    render(
      <DiffView
        version={mockVersion}
        currentTitle="Old Title"
        currentContent="line one\nline changed\nline three"
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("diff-view")).toBeInTheDocument();
    // Unified mode is the default
    expect(screen.getByTestId("diff-mode-unified").className).toContain("bg-primary");
  });

  it("renders split diff when toggled", async () => {
    render(
      <DiffView
        version={mockVersion}
        currentTitle="Old Title"
        currentContent="line one\nline changed\nline three"
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const splitButton = screen.getByTestId("diff-mode-split");
    await userEvent.click(splitButton);

    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("toggles between unified and split view", async () => {
    render(
      <DiffView
        version={mockVersion}
        currentTitle="Old Title"
        currentContent="different content"
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Start in unified mode
    const unifiedBtn = screen.getByTestId("diff-mode-unified");
    expect(unifiedBtn.className).toContain("bg-primary");

    // Switch to split
    await userEvent.click(screen.getByTestId("diff-mode-split"));
    expect(screen.getByTestId("diff-mode-split").className).toContain("bg-primary");

    // Switch back
    await userEvent.click(screen.getByTestId("diff-mode-unified"));
    expect(screen.getByTestId("diff-mode-unified").className).toContain("bg-primary");
  });

  it("shows title diff when title changed", () => {
    render(
      <DiffView
        version={mockVersion}
        currentTitle="New Title"
        currentContent={mockVersion.content}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Title changed")).toBeInTheDocument();
  });

  it("does not show title diff when title unchanged", () => {
    render(
      <DiffView
        version={mockVersion}
        currentTitle="Old Title"
        currentContent={mockVersion.content}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("Title changed")).not.toBeInTheDocument();
  });

  it("calls onRestore after two-step confirm", async () => {
    const onRestore = vi.fn();

    render(
      <DiffView
        version={mockVersion}
        currentTitle="Old Title"
        currentContent={mockVersion.content}
        onRestore={onRestore}
        onClose={vi.fn()}
      />,
    );

    // First click shows confirm
    await userEvent.click(screen.getByTestId("restore-button"));
    expect(screen.getByText("Restore?")).toBeInTheDocument();

    // Second click confirms
    await userEvent.click(screen.getByTestId("confirm-restore"));
    expect(onRestore).toHaveBeenCalled();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();

    render(
      <DiffView
        version={mockVersion}
        currentTitle="Old Title"
        currentContent={mockVersion.content}
        onRestore={vi.fn()}
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByTestId("close-diff"));
    expect(onClose).toHaveBeenCalled();
  });
});
