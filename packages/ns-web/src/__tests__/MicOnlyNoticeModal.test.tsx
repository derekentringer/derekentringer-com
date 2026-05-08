import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MicOnlyNoticeModal } from "../components/MicOnlyNoticeModal.tsx";

describe("MicOnlyNoticeModal", () => {
  it("renders the title and the Got it button", () => {
    render(<MicOnlyNoticeModal onConfirm={vi.fn()} />);
    expect(
      screen.getByText("Web recordings use your microphone only"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("calls onConfirm with false when checkbox is unchecked", () => {
    const onConfirm = vi.fn();
    render(<MicOnlyNoticeModal onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm with true when 'Don't show again' is checked", () => {
    const onConfirm = vi.fn();
    render(<MicOnlyNoticeModal onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("confirms on Enter keypress", () => {
    const onConfirm = vi.fn();
    render(<MicOnlyNoticeModal onConfirm={onConfirm} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});
