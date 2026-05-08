import { describe, it, expect } from "vitest";
import { formatChatTimestamp } from "../time.ts";

const NOW = new Date("2026-04-30T14:30:00");

describe("formatChatTimestamp", () => {
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
    t.setHours(9, 5, 0, 0); // 9:05am same day
    expect(formatChatTimestamp(t.toISOString(), NOW)).toBe("9:05am");
  });

  it("returns 'Yesterday h:mmpm' for the prior calendar day", () => {
    const t = new Date(NOW);
    t.setDate(t.getDate() - 1);
    t.setHours(16, 15, 0, 0); // 4:15pm yesterday
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
