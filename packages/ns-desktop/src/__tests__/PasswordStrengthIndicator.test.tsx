import { render, screen } from "@testing-library/react";
import { PasswordStrengthIndicator } from "../components/PasswordStrengthIndicator.tsx";

vi.mock("@derekentringer/shared", () => ({
  validatePasswordStrength: (password: string) => {
    const rules = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /[a-z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ];
    const passed = rules.filter(Boolean).length;
    return {
      valid: passed === 5,
      errors: passed < 5 ? ["Password does not meet requirements"] : [],
    };
  },
}));

describe("PasswordStrengthIndicator", () => {
  it("renders nothing when password is empty", () => {
    const { container } = render(<PasswordStrengthIndicator password="" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows red bar for weak password", () => {
    render(<PasswordStrengthIndicator password="ab" />);
    const bar = document.querySelector("[class*='bg-red']");
    expect(bar).toBeInTheDocument();
  });

  it("shows green bar for strong password", () => {
    render(<PasswordStrengthIndicator password="StrongPass1!" />);
    const bar = document.querySelector("[class*='bg-green']");
    expect(bar).toBeInTheDocument();
  });

  it("shows checkmarks for passed rules", () => {
    render(<PasswordStrengthIndicator password="StrongPass1!" />);
    const checkmarks = screen.getAllByText("✓", { exact: false });
    expect(checkmarks.length).toBeGreaterThan(0);
  });
});
