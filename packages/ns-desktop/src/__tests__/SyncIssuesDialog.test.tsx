import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncIssuesDialog } from "../components/SyncIssuesDialog.tsx";
import type { SyncRejection } from "@derekentringer/ns-shared";

vi.mock("../lib/syncEngine.ts", () => ({}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn() },
}));

function makeRejection(overrides: Partial<SyncRejection> = {}): SyncRejection {
  return {
    changeId: "note-1",
    changeType: "note",
    changeAction: "update",
    reason: "timestamp_conflict",
    message: "Timestamp conflict",
    ...overrides,
  };
}

describe("SyncIssuesDialog", () => {
  const defaultProps = {
    rejections: [makeRejection()],
    entityNames: new Map([["note-1", "My Note"]]),
    onForcePush: vi.fn().mockResolvedValue(undefined),
    onDiscard: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  it("renders header with rejection count", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.getByText("Sync Conflicts")).toBeInTheDocument();
    expect(screen.getByText(/1 item couldn't sync/)).toBeInTheDocument();
  });

  it("renders plural count for multiple rejections", () => {
    const rejections = [
      makeRejection({ changeId: "note-1" }),
      makeRejection({ changeId: "note-2", changeType: "folder" }),
    ];
    render(
      <SyncIssuesDialog
        {...defaultProps}
        rejections={rejections}
        entityNames={new Map([["note-1", "Note A"], ["note-2", "Folder B"]])}
      />,
    );
    expect(screen.getByText(/2 items couldn't sync/)).toBeInTheDocument();
  });

  it("displays entity name and action badge", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.getByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("update")).toBeInTheDocument();
  });

  it("displays human-readable rejection description", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.getByText(/modified on another device/)).toBeInTheDocument();
  });

  it("falls back to Untitled when no entity name", () => {
    render(
      <SyncIssuesDialog
        {...defaultProps}
        entityNames={new Map()}
      />,
    );
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("calls onForcePush with single item", async () => {
    const onForcePush = vi.fn().mockResolvedValue(undefined);
    render(<SyncIssuesDialog {...defaultProps} onForcePush={onForcePush} />);

    fireEvent.click(screen.getByText("Use My Version"));
    await waitFor(() => {
      expect(onForcePush).toHaveBeenCalledWith(["note-1"]);
    });
  });

  it("calls onDiscard with single item", async () => {
    const onDiscard = vi.fn().mockResolvedValue(undefined);
    render(<SyncIssuesDialog {...defaultProps} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByText("Use Server Version"));
    await waitFor(() => {
      expect(onDiscard).toHaveBeenCalledWith(["note-1"]);
    });
  });

  it("shows bulk actions when multiple rejections", () => {
    const rejections = [
      makeRejection({ changeId: "note-1" }),
      makeRejection({ changeId: "note-2" }),
    ];
    render(
      <SyncIssuesDialog
        {...defaultProps}
        rejections={rejections}
        entityNames={new Map([["note-1", "Note A"], ["note-2", "Note B"]])}
      />,
    );
    expect(screen.getByText("Use My Version for All")).toBeInTheDocument();
    expect(screen.getByText("Use Server Version for All")).toBeInTheDocument();
  });

  it("does not show bulk actions for single rejection", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.queryByText("Use My Version for All")).not.toBeInTheDocument();
    expect(screen.queryByText("Use Server Version for All")).not.toBeInTheDocument();
  });

  it("calls onForcePush with all IDs on bulk action", async () => {
    const onForcePush = vi.fn().mockResolvedValue(undefined);
    const rejections = [
      makeRejection({ changeId: "note-1" }),
      makeRejection({ changeId: "note-2" }),
    ];
    render(
      <SyncIssuesDialog
        {...defaultProps}
        rejections={rejections}
        onForcePush={onForcePush}
        entityNames={new Map([["note-1", "A"], ["note-2", "B"]])}
      />,
    );

    fireEvent.click(screen.getByText("Use My Version for All"));
    await waitFor(() => {
      expect(onForcePush).toHaveBeenCalledWith(["note-1", "note-2"]);
    });
  });

  it("calls onDiscard with all IDs on bulk action", async () => {
    const onDiscard = vi.fn().mockResolvedValue(undefined);
    const rejections = [
      makeRejection({ changeId: "note-1" }),
      makeRejection({ changeId: "note-2" }),
    ];
    render(
      <SyncIssuesDialog
        {...defaultProps}
        rejections={rejections}
        onDiscard={onDiscard}
        entityNames={new Map([["note-1", "A"], ["note-2", "B"]])}
      />,
    );

    fireEvent.click(screen.getByText("Use Server Version for All"));
    await waitFor(() => {
      expect(onDiscard).toHaveBeenCalledWith(["note-1", "note-2"]);
    });
  });

  it("calls onClose when close button clicked", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Close"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
