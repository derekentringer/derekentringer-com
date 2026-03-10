import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPage } from "../pages/AdminPage.tsx";

const mockGetUsers = vi.fn();
const mockGetApprovedEmails = vi.fn();
const mockGetAdminAiSettings = vi.fn();
const mockSetAdminAiSettings = vi.fn();
const mockSetApprovedEmails = vi.fn();
const mockResetUserPassword = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("../api/admin.ts", () => ({
  getUsers: (...args: unknown[]) => mockGetUsers(...args),
  getApprovedEmails: (...args: unknown[]) => mockGetApprovedEmails(...args),
  getAdminAiSettings: (...args: unknown[]) => mockGetAdminAiSettings(...args),
  setAdminAiSettings: (...args: unknown[]) => mockSetAdminAiSettings(...args),
  setApprovedEmails: (...args: unknown[]) => mockSetApprovedEmails(...args),
  resetUserPassword: (...args: unknown[]) => mockResetUserPassword(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

beforeEach(() => {
  mockGetUsers.mockResolvedValue([
    { id: "1", email: "admin@test.com", displayName: "Admin", role: "admin", totpEnabled: true, createdAt: "2025-01-01" },
    { id: "2", email: "user@test.com", displayName: "User", role: "user", totpEnabled: false, createdAt: "2025-01-02" },
  ]);
  mockGetApprovedEmails.mockResolvedValue(["admin@test.com", "user@test.com"]);
  mockGetAdminAiSettings.mockResolvedValue({ aiEnabled: true });
  mockSetAdminAiSettings.mockReset();
  mockSetApprovedEmails.mockReset();
  mockResetUserPassword.mockReset();
  mockDeleteUser.mockReset();
});

function renderAdminPage(props?: { onBack?: () => void }) {
  const onBack = props?.onBack ?? vi.fn();
  const result = render(<AdminPage onBack={onBack} />);
  return { ...result, onBack };
}

describe("AdminPage", () => {
  it("renders Admin heading", async () => {
    renderAdminPage();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders all three section headings", async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText("AI Controls")).toBeInTheDocument();
    });
    expect(screen.getByText("Approved Emails")).toBeInTheDocument();
    expect(screen.getByText("User Management")).toBeInTheDocument();
  });

  it("renders AI toggle switch", async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText("Enable AI features globally")).toBeInTheDocument();
    });
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("renders approved emails textarea", async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("user@example.com")).toBeInTheDocument();
    });
  });

  it("renders user table after loading", async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText("admin@test.com")).toBeInTheDocument();
    });
    expect(screen.getByText("user@test.com")).toBeInTheDocument();
    // "admin" role badge in table (lowercase)
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("calls onBack when Back button clicked", async () => {
    const { onBack } = renderAdminPage();
    await userEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows Reset Password dialog when Reset pw clicked", async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText("admin@test.com")).toBeInTheDocument();
    });
    const resetButtons = screen.getAllByText("Reset pw");
    await userEvent.click(resetButtons[0]);
    expect(screen.getByText("Reset Password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New password")).toBeInTheDocument();
  });

  it("shows Delete User dialog when Delete clicked", async () => {
    renderAdminPage();
    await waitFor(() => {
      expect(screen.getByText("user@test.com")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete User")).toBeInTheDocument();
  });
});
