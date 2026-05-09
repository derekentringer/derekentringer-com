import { relativeTime, formatChatTimestamp } from "@/lib/time";

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

describe("formatChatTimestamp", () => {
  const NOW = new Date("2026-04-30T14:30:00");

  it("returns 'Just now' for messages under 60s old", () => {
    const t = new Date(NOW.getTime() - 30_000).toISOString();
    expect(formatChatTimestamp(t, NOW)).toBe("Just now");
  });

  it("returns '1min ago' for exactly one minute", () => {
    const t = new Date(NOW.getTime() - 60_000).toISOString();
    expect(formatChatTimestamp(t, NOW)).toBe("1min ago");
  });

  it("returns 'Nmins ago' for 2-59 minutes", () => {
    const t = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    expect(formatChatTimestamp(t, NOW)).toBe("2mins ago");
    const t59 = new Date(NOW.getTime() - 59 * 60_000).toISOString();
    expect(formatChatTimestamp(t59, NOW)).toBe("59mins ago");
  });

  it("returns bare 'h:mmam/pm' for messages from earlier today (≥1h)", () => {
    const t = new Date(NOW);
    t.setHours(9, 5, 0, 0);
    expect(formatChatTimestamp(t.toISOString(), NOW)).toBe("9:05am");
  });

  it("returns 'Yesterday h:mmpm' for the prior calendar day", () => {
    const t = new Date(NOW);
    t.setDate(t.getDate() - 1);
    t.setHours(16, 15, 0, 0);
    expect(formatChatTimestamp(t.toISOString(), NOW)).toBe("Yesterday 4:15pm");
  });

  it("returns 'MM/DD at h:mmpm' for older same-year messages", () => {
    const t = new Date("2026-03-15T13:30:00").toISOString();
    expect(formatChatTimestamp(t, NOW)).toBe("03/15 at 1:30pm");
  });

  it("returns 'MM/DD/YY at h:mmpm' for messages in older years", () => {
    const t = new Date("2024-04-29T13:30:00").toISOString();
    expect(formatChatTimestamp(t, NOW)).toBe("04/29/24 at 1:30pm");
  });

  it("returns empty string for invalid input", () => {
    expect(formatChatTimestamp("not-a-date", NOW)).toBe("");
  });

  it("returns 'Just now' for clocks that drifted into the future", () => {
    const t = new Date(NOW.getTime() + 5_000).toISOString();
    expect(formatChatTimestamp(t, NOW)).toBe("Just now");
  });

  it("formats noon and midnight using 12-hour clock", () => {
    const noon = new Date(NOW);
    noon.setHours(12, 0, 0, 0);
    expect(formatChatTimestamp(noon.toISOString(), NOW)).toBe("12:00pm");
    const yesterdayMidnight = new Date(NOW);
    yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
    yesterdayMidnight.setHours(0, 0, 0, 0);
    expect(formatChatTimestamp(yesterdayMidnight.toISOString(), NOW)).toBe(
      "Yesterday 12:00am",
    );
  });
});
