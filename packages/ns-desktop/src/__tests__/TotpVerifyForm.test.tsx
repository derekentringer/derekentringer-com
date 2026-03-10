import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TotpVerifyForm } from "../components/TotpVerifyForm.tsx";

describe("TotpVerifyForm", () => {
  const mockVerify = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 6 digit inputs", () => {
    render(<TotpVerifyForm onVerify={mockVerify} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(6);
  });

  it("auto-advances focus on digit entry", () => {
    render(<TotpVerifyForm onVerify={mockVerify} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0], { target: { value: "1" } });
    expect(inputs[1]).toHaveFocus();
  });

  it("auto-submits when 6 digits entered", async () => {
    render(<TotpVerifyForm onVerify={mockVerify} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0], { target: { value: "1" } });
    fireEvent.change(inputs[1], { target: { value: "2" } });
    fireEvent.change(inputs[2], { target: { value: "3" } });
    fireEvent.change(inputs[3], { target: { value: "4" } });
    fireEvent.change(inputs[4], { target: { value: "5" } });
    fireEvent.change(inputs[5], { target: { value: "6" } });

    expect(mockVerify).toHaveBeenCalledWith("123456");
  });

  it("handles paste of 6 digits", () => {
    render(<TotpVerifyForm onVerify={mockVerify} />);
    const container = screen.getAllByRole("textbox")[0].closest("div")!;

    fireEvent.paste(container, {
      clipboardData: { getData: () => "654321" },
    });

    expect(mockVerify).toHaveBeenCalledWith("654321");
  });

  it("switches to backup code view", () => {
    render(<TotpVerifyForm onVerify={mockVerify} />);

    fireEvent.click(screen.getByText("Use a backup code instead"));
    expect(screen.getByPlaceholderText("Backup code")).toBeInTheDocument();
    expect(screen.getByText("Enter a backup code")).toBeInTheDocument();
  });
});
