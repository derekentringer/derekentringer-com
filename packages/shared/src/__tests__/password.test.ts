import { describe, it, expect } from "vitest";
import { validatePasswordStrength } from "../validation/password.js";

describe("validatePasswordStrength", () => {
  it("accepts a strong password", () => {
    const result = validatePasswordStrength("MyP@ssw0rd!");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = validatePasswordStrength("Aa1!x");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must be at least 8 characters");
  });

  it("rejects a password without an uppercase letter", () => {
    const result = validatePasswordStrength("myp@ssw0rd!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain an uppercase letter");
  });

  it("rejects a password without a lowercase letter", () => {
    const result = validatePasswordStrength("MYP@SSW0RD!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain a lowercase letter");
  });

  it("rejects a password without a number", () => {
    const result = validatePasswordStrength("MyP@ssword!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain a number");
  });

  it("rejects a password without a special character", () => {
    const result = validatePasswordStrength("MyPassw0rd");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must contain a special character");
  });

  it("returns multiple errors for a very weak password", () => {
    const result = validatePasswordStrength("abc");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("accepts exactly 8 characters if all criteria met", () => {
    const result = validatePasswordStrength("Aa1!bcde");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts various special characters", () => {
    for (const ch of ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "-", "_", "=", "+"]) {
      const result = validatePasswordStrength(`Abcdef1${ch}`);
      expect(result.valid).toBe(true);
    }
  });
});
