import { relativeTime } from "@/lib/time";

describe("relativeTime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-26T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 'just now' for dates less than 60s ago", () => {
    expect(relativeTime("2026-03-26T11:59:30Z")).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(relativeTime("2026-03-26T11:55:00Z")).toBe("5m ago");
  });

  it("returns hours ago", () => {
    expect(relativeTime("2026-03-26T09:00:00Z")).toBe("3h ago");
  });

  it("returns days ago", () => {
    expect(relativeTime("2026-03-24T12:00:00Z")).toBe("2d ago");
  });

  it("returns weeks ago for 14+ days", () => {
    expect(relativeTime("2026-03-05T12:00:00Z")).toBe("3w ago");
  });

  it("returns months ago for 8+ weeks", () => {
    expect(relativeTime("2025-12-26T12:00:00Z")).toBe("3mo ago");
  });

  it("returns years ago", () => {
    expect(relativeTime("2024-03-26T12:00:00Z")).toBe("2y ago");
  });

  it("returns 'just now' for future dates", () => {
    expect(relativeTime("2026-03-27T12:00:00Z")).toBe("just now");
  });

  it("returns 'just now' for current time", () => {
    expect(relativeTime("2026-03-26T12:00:00Z")).toBe("just now");
  });
});
