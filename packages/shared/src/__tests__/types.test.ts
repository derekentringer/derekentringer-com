import { describe, it, expect } from "vitest";
import { AccountType } from "../finance/types.js";

describe("AccountType enum", () => {
  it("has the expected values", () => {
    expect(AccountType.Checking).toBe("checking");
    expect(AccountType.Savings).toBe("savings");
    expect(AccountType.HighYieldSavings).toBe("high_yield_savings");
    expect(AccountType.Credit).toBe("credit");
    expect(AccountType.Investment).toBe("investment");
    expect(AccountType.Loan).toBe("loan");
    expect(AccountType.Other).toBe("other");
  });

  it("has exactly 7 members", () => {
    const values = Object.values(AccountType);
    expect(values).toHaveLength(7);
  });
});
