import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnlineStatusIndicator } from "../components/OnlineStatusIndicator.tsx";

describe("OnlineStatusIndicator", () => {
  it("shows green dot when online", () => {
    render(
      <OnlineStatusIndicator isOnline={true} pendingCount={0} lastSyncedAt={null} />,
    );
    const dot = screen.getByTestId("online-status-dot");
    expect(dot.className).toContain("bg-green-500");
  });

  it("shows yellow dot when offline", () => {
    render(
      <OnlineStatusIndicator isOnline={false} pendingCount={0} lastSyncedAt={null} />,
    );
    const dot = screen.getByTestId("online-status-dot");
    expect(dot.className).toContain("bg-yellow-500");
  });

  it("shows pending count when > 0", () => {
    render(
      <OnlineStatusIndicator isOnline={false} pendingCount={3} lastSyncedAt={null} />,
    );
    expect(screen.getByTestId("pending-count").textContent).toBe("3 pending");
  });

  it("hides pending count when 0", () => {
    render(
      <OnlineStatusIndicator isOnline={true} pendingCount={0} lastSyncedAt={null} />,
    );
    expect(screen.queryByTestId("pending-count")).not.toBeInTheDocument();
  });

  it("shows tooltip with offline duration", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000);
    const { container } = render(
      <OnlineStatusIndicator isOnline={false} pendingCount={0} lastSyncedAt={fiveMinAgo} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.title).toContain("Offline");
    expect(wrapper.title).toContain("5m ago");
  });
});
