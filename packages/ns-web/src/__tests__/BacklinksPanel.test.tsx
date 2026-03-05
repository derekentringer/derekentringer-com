import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BacklinksPanel } from "../components/BacklinksPanel.tsx";

const mockFetchBacklinks = vi.fn();

vi.mock("../api/offlineNotes.ts", () => ({
  fetchBacklinks: (...args: unknown[]) => mockFetchBacklinks(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BacklinksPanel", () => {
  it("renders backlinks when they exist", async () => {
    mockFetchBacklinks.mockResolvedValue({
      backlinks: [
        { noteId: "note-1", noteTitle: "Source Note", linkText: "My Note" },
      ],
    });
    const onNavigate = vi.fn();

    render(<BacklinksPanel noteId="target-1" onNavigate={onNavigate} />);

    await waitFor(() => {
      expect(screen.getByText("Backlinks (1)")).toBeInTheDocument();
    });
    expect(screen.getByText("Source Note")).toBeInTheDocument();
    expect(screen.getByText("via [[My Note]]")).toBeInTheDocument();
  });

  it("is hidden when no backlinks", async () => {
    mockFetchBacklinks.mockResolvedValue({ backlinks: [] });
    const onNavigate = vi.fn();

    const { container } = render(
      <BacklinksPanel noteId="target-1" onNavigate={onNavigate} />,
    );

    await waitFor(() => {
      expect(mockFetchBacklinks).toHaveBeenCalledWith("target-1");
    });

    expect(container.querySelector("[data-testid='backlinks-panel']")).toBeNull();
  });

  it("calls onNavigate when clicking a backlink", async () => {
    mockFetchBacklinks.mockResolvedValue({
      backlinks: [
        { noteId: "note-1", noteTitle: "Source Note", linkText: "My Note" },
      ],
    });
    const onNavigate = vi.fn();

    render(<BacklinksPanel noteId="target-1" onNavigate={onNavigate} />);

    const link = await screen.findByText("Source Note");
    await userEvent.click(link);

    expect(onNavigate).toHaveBeenCalledWith("note-1");
  });

  it("toggles collapse when clicking header", async () => {
    mockFetchBacklinks.mockResolvedValue({
      backlinks: [
        { noteId: "note-1", noteTitle: "Source Note", linkText: "My Note" },
      ],
    });
    const onNavigate = vi.fn();

    render(<BacklinksPanel noteId="target-1" onNavigate={onNavigate} />);

    await screen.findByText("Source Note");

    // Click to collapse
    await userEvent.click(screen.getByText("Backlinks (1)"));

    // Source Note should be hidden
    expect(screen.queryByText("Source Note")).not.toBeInTheDocument();

    // Click to expand
    await userEvent.click(screen.getByText("Backlinks (1)"));

    // Source Note should be visible again
    expect(screen.getByText("Source Note")).toBeInTheDocument();
  });
});
