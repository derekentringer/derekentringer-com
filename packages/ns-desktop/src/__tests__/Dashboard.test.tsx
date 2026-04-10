import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Note } from "@derekentringer/ns-shared";
import { Dashboard } from "../components/Dashboard.tsx";

vi.mock("../lib/db.ts", () => ({
  fetchRecentlyEditedNotes: vi.fn(),
  fetchFavoriteNotes: vi.fn(),
  fetchAudioNotes: vi.fn(),
}));

import {
  fetchRecentlyEditedNotes,
  fetchFavoriteNotes,
  fetchAudioNotes,
} from "../lib/db.ts";

const mockFetchRecent = vi.mocked(fetchRecentlyEditedNotes);
const mockFetchFavorites = vi.mocked(fetchFavoriteNotes);
const mockFetchAudio = vi.mocked(fetchAudioNotes);

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
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

const recentNotes: Note[] = [
  makeNote({ id: "recent-1", title: "Hero Note" }),
  makeNote({ id: "recent-2", title: "Recent Note 2" }),
  makeNote({ id: "recent-3", title: "Recent Note 3" }),
];

const favoriteNotes: Note[] = [
  makeNote({ id: "fav-1", title: "Favorite Note", favorite: true }),
];

const audioNotes: Note[] = [
  makeNote({ id: "audio-1", title: "Audio Note", audioMode: "memo" }),
];

describe("Dashboard", () => {
  let onSelectNote: (noteId: string) => void;
  let onCreateNote: () => void;
  let onStartRecording: () => void;
  let onImportFile: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelectNote = vi.fn();
    onCreateNote = vi.fn();
    onStartRecording = vi.fn();
    onImportFile = vi.fn();

    mockFetchRecent.mockResolvedValue(recentNotes);
    mockFetchFavorites.mockResolvedValue(favoriteNotes);
    mockFetchAudio.mockResolvedValue(audioNotes);
  });

  it("renders all 5 sections when data is available", async () => {
    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    expect(screen.getByText("Resume Editing")).toBeInTheDocument();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("Recently Edited")).toBeInTheDocument();
    expect(screen.getByText("Audio Notes")).toBeInTheDocument();
  });

  it("calls onCreateNote when New Note quick action clicked", async () => {
    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("New Note")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("New Note"));
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it("calls onStartRecording when Record quick action clicked", async () => {
    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("New Recording")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("New Recording"));
    expect(onStartRecording).toHaveBeenCalledTimes(1);
  });

  it("calls onSelectNote with noteId when a note card is clicked", async () => {
    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Hero Note")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Hero Note"));
    expect(onSelectNote).toHaveBeenCalledTimes(1);
    expect(onSelectNote).toHaveBeenCalledWith("recent-1");
  });

  it("hides Audio Notes section when audioNotesEnabled is false", async () => {
    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    expect(screen.queryByText("Audio Notes")).not.toBeInTheDocument();
  });

  it("shows empty state sections appropriately", async () => {
    mockFetchRecent.mockResolvedValue([]);
    mockFetchFavorites.mockResolvedValue([]);
    mockFetchAudio.mockResolvedValue([]);

    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });

    // With empty data, these sections should not render
    expect(screen.queryByText("Resume Editing")).not.toBeInTheDocument();
    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Edited")).not.toBeInTheDocument();
    expect(screen.queryByText("Audio Notes")).not.toBeInTheDocument();
  });

  it("shows skeleton placeholders while loading", () => {
    // Make the fetch never resolve so we stay in the loading state
    mockFetchRecent.mockReturnValue(new Promise(() => {}));
    mockFetchFavorites.mockReturnValue(new Promise(() => {}));
    mockFetchAudio.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  it("calls onImportFile when Import File quick action clicked", async () => {
    render(
      <Dashboard
        onSelectNote={onSelectNote}
        onCreateNote={onCreateNote}
        onStartRecording={onStartRecording}
        onImportFile={onImportFile}
        audioNotesEnabled={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Import File")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Import File"));
    expect(onImportFile).toHaveBeenCalledTimes(1);
  });
});
