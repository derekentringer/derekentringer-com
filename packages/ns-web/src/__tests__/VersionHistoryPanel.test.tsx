import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel.tsx";
import type { NoteVersion } from "@derekentringer/shared/ns";

const mockFetchVersions = vi.fn();

vi.mock("../api/offlineNotes.ts", () => ({
  fetchVersions: (...args: unknown[]) => mockFetchVersions(...args),
}));

const mockVersions: NoteVersion[] = [
  {
    id: "v1",
    noteId: "n1",
    title: "Version 1",
    content: "Content 1",
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m ago
  },
  {
    id: "v2",
    noteId: "n1",
    title: "Version 2",
    content: "Content 2",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VersionHistoryPanel", () => {
  it("renders version list", async () => {
    mockFetchVersions.mockResolvedValue({ versions: mockVersions, total: 2 });

    render(
      <VersionHistoryPanel
        noteId="n1"
        onSelectVersion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Version 1")).toBeInTheDocument();
      expect(screen.getByText("Version 2")).toBeInTheDocument();
    });
  });

  it("shows empty state when no versions", async () => {
    mockFetchVersions.mockResolvedValue({ versions: [], total: 0 });

    render(
      <VersionHistoryPanel
        noteId="n1"
        onSelectVersion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No versions yet")).toBeInTheDocument();
    });
  });

  it("highlights selected version", async () => {
    mockFetchVersions.mockResolvedValue({ versions: mockVersions, total: 2 });

    render(
      <VersionHistoryPanel
        noteId="n1"
        onSelectVersion={vi.fn()}
        selectedVersionId="v1"
      />,
    );

    await waitFor(() => {
      const items = screen.getAllByTestId("version-item");
      expect(items[0].className).toContain("bg-primary");
    });
  });

  it("calls onSelectVersion when clicked", async () => {
    const onSelect = vi.fn();
    mockFetchVersions.mockResolvedValue({ versions: mockVersions, total: 2 });

    render(
      <VersionHistoryPanel
        noteId="n1"
        onSelectVersion={onSelect}
      />,
    );

    const item = await screen.findByText("Version 1");
    await userEvent.click(item);

    expect(onSelect).toHaveBeenCalledWith(mockVersions[0]);
  });

  it("shows relative time formatting", async () => {
    mockFetchVersions.mockResolvedValue({ versions: mockVersions, total: 2 });

    render(
      <VersionHistoryPanel
        noteId="n1"
        onSelectVersion={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("5m ago")).toBeInTheDocument();
      expect(screen.getByText("2h ago")).toBeInTheDocument();
    });
  });
});
