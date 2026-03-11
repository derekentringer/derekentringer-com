import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SyncStatusButton } from "../components/SyncStatusButton.tsx";

describe("SyncStatusButton", () => {
  it("renders with title 'Synced' when status is idle", () => {
    render(<SyncStatusButton status="idle" error={null} onSync={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Synced");
  });

  it("renders with title 'Syncing...' when status is syncing", () => {
    render(<SyncStatusButton status="syncing" error={null} onSync={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Syncing...");
  });

  it("renders with title 'Offline' when status is offline", () => {
    render(
      <SyncStatusButton status="offline" error={null} onSync={vi.fn()} />,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Offline");
  });

  it("renders with error message as title when status is error", () => {
    render(
      <SyncStatusButton
        status="error"
        error="Network timeout"
        onSync={vi.fn()}
      />,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Network timeout");
  });

  it("button is disabled when status is offline", () => {
    render(
      <SyncStatusButton status="offline" error={null} onSync={vi.fn()} />,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("button is not disabled when status is idle", () => {
    render(<SyncStatusButton status="idle" error={null} onSync={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
  });

  it("calls onSync when clicked in idle state", () => {
    const onSync = vi.fn();
    render(<SyncStatusButton status="idle" error={null} onSync={onSync} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("has animate-spin class on icon when syncing", () => {
    render(<SyncStatusButton status="syncing" error={null} onSync={vi.fn()} />);
    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toHaveClass("animate-spin");
  });

  it("shows pending count in tooltip when offline with pending changes", () => {
    render(
      <SyncStatusButton status="offline" error={null} onSync={vi.fn()} pendingCount={5} />,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Offline — 5 pending");
  });

  it("shows plain 'Offline' tooltip when offline with no pending changes", () => {
    render(
      <SyncStatusButton status="offline" error={null} onSync={vi.fn()} pendingCount={0} />,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Offline");
  });
});
