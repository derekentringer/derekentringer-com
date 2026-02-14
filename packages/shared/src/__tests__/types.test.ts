import { describe, it, expect } from "vitest";
import { AccountType } from "../finance/types.js";

describe("AccountType enum", () => {
  it("has the expected values", () => {
    expect(AccountType.Checking).toBe("checking");
    expect(AccountType.Savings).toBe("savings");
    expect(AccountType.Credit).toBe("credit");
    expect(AccountType.Investment).toBe("investment");
    expect(AccountType.Loan).toBe("loan");
    expect(AccountType.Other).toBe("other");
  });

  it("has exactly 6 members", () => {
    const values = Object.values(AccountType);
    expect(values).toHaveLength(6);
  });
});
