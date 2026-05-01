import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@derekentringer/shared/ns";
import { Dashboard } from "../components/Dashboard.tsx";

vi.mock("../api/notes.ts", () => ({
  fetchDashboardData: vi.fn(),
}));

import { fetchDashboardData } from "../api/notes.ts";

const mockFetchDashboardData = fetchDashboardData as ReturnType<typeof vi.fn>;

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Test Note",
    content: "Some content",
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
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

const fullDashboardData = {
  recentlyEdited: [
    makeNote({ id: "recent-1", title: "Most Recent Note" }),
    makeNote({ id: "recent-2", title: "Second Recent Note" }),
    makeNote({ id: "recent-3", title: "Third Recent Note" }),
  ],
  favorites: [
    makeNote({ id: "fav-1", title: "Favorite Note", favorite: true }),
  ],
  audioNotes: [
    makeNote({ id: "audio-1", title: "Audio Note", audioMode: null }),
  ],
};

describe("Dashboard", () => {
  const defaultProps = {
    onSelectNote: vi.fn(),
    onCreateNote: vi.fn(),
    onStartRecording: vi.fn(),
    audioNotesEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 5 sections when data is available", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    expect(screen.getByText("Resume Editing")).toBeInTheDocument();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("Recently Edited")).toBeInTheDocument();
    expect(screen.getByText("Audio Notes")).toBeInTheDocument();
  });

  it("calls onCreateNote when New Note quick action clicked", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("New Note")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("New Note"));

    expect(defaultProps.onCreateNote).toHaveBeenCalledTimes(1);
  });

  it("calls onStartRecording('meeting') when Meeting quick action clicked", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Meeting")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Meeting"));

    expect(defaultProps.onStartRecording).toHaveBeenCalledTimes(1);
    expect(defaultProps.onStartRecording).toHaveBeenCalledWith("meeting");
  });

  it("calls onSelectNote with noteId when a note card is clicked", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Favorite Note")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Favorite Note"));

    expect(defaultProps.onSelectNote).toHaveBeenCalledWith("fav-1");
  });

  it("hides Audio Notes section when audioNotesEnabled is false", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} audioNotesEnabled={false} />);

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    expect(screen.queryByText("Audio Notes")).not.toBeInTheDocument();
  });

  it("shows empty state sections appropriately", async () => {
    mockFetchDashboardData.mockResolvedValue({
      recentlyEdited: [],
      favorites: [],
      audioNotes: [],
    });

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    // No hero note, no favorites, no recently edited, no audio notes sections
    expect(screen.queryByText("Resume Editing")).not.toBeInTheDocument();
    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Edited")).not.toBeInTheDocument();
    expect(screen.queryByText("Audio Notes")).not.toBeInTheDocument();
  });

  it("shows skeleton placeholders while loading", () => {
    mockFetchDashboardData.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<Dashboard {...defaultProps} />);

    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  it("does not render the Import File quick action", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    expect(screen.queryByText("Import File")).not.toBeInTheDocument();
  });

  it("orders Quick Actions as New Note, then mode-specific recording tiles", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Meeting")).toBeInTheDocument();
    });

    const newNote = screen.getByText("New Note");
    const meeting = screen.getByText("Meeting");
    const lecture = screen.getByText("Lecture");
    const memo = screen.getByText("Memo");
    const verbatim = screen.getByText("Verbatim");
    expect(newNote.compareDocumentPosition(meeting)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(meeting.compareDocumentPosition(lecture)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(lecture.compareDocumentPosition(memo)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(memo.compareDocumentPosition(verbatim)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("hides recording quick actions when audioNotesEnabled is false", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} audioNotesEnabled={false} />);

    await waitFor(() => {
      expect(screen.getByText("New Note")).toBeInTheDocument();
    });

    expect(screen.queryByText("Meeting")).not.toBeInTheDocument();
    expect(screen.queryByText("Lecture")).not.toBeInTheDocument();
    expect(screen.queryByText("Memo")).not.toBeInTheDocument();
    expect(screen.queryByText("Verbatim")).not.toBeInTheDocument();
  });

  it("calls onStartRecording with the matching mode for each tile", async () => {
    mockFetchDashboardData.mockResolvedValue(fullDashboardData);

    render(<Dashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Meeting")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Meeting"));
    await userEvent.click(screen.getByText("Lecture"));
    await userEvent.click(screen.getByText("Memo"));
    await userEvent.click(screen.getByText("Verbatim"));

    expect(defaultProps.onStartRecording).toHaveBeenNthCalledWith(1, "meeting");
    expect(defaultProps.onStartRecording).toHaveBeenNthCalledWith(2, "lecture");
    expect(defaultProps.onStartRecording).toHaveBeenNthCalledWith(3, "memo");
    expect(defaultProps.onStartRecording).toHaveBeenNthCalledWith(4, "verbatim");
  });

});
