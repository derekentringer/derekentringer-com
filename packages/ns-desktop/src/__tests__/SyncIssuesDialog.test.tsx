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
    reason: "fk_constraint",
    message: "Referenced folder does not exist",
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
    expect(screen.getByText("Sync Issues")).toBeInTheDocument();
    expect(screen.getByText("1 change could not be synced")).toBeInTheDocument();
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
    expect(screen.getByText("2 changes could not be synced")).toBeInTheDocument();
  });

  it("displays entity name and type badge", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.getByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();
  });

  it("displays rejection message", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.getByText("Referenced folder does not exist")).toBeInTheDocument();
  });

  it("falls back to changeId when no entity name", () => {
    render(
      <SyncIssuesDialog
        {...defaultProps}
        entityNames={new Map()}
      />,
    );
    expect(screen.getByText("note-1")).toBeInTheDocument();
  });

  it("calls onForcePush with single item", async () => {
    const onForcePush = vi.fn().mockResolvedValue(undefined);
    render(<SyncIssuesDialog {...defaultProps} onForcePush={onForcePush} />);

    fireEvent.click(screen.getByText("Force Push"));
    await waitFor(() => {
      expect(onForcePush).toHaveBeenCalledWith(["note-1"]);
    });
  });

  it("calls onDiscard with single item", async () => {
    const onDiscard = vi.fn().mockResolvedValue(undefined);
    render(<SyncIssuesDialog {...defaultProps} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByText("Discard"));
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
    expect(screen.getByText("Force Push All")).toBeInTheDocument();
    expect(screen.getByText("Discard All")).toBeInTheDocument();
  });

  it("does not show bulk actions for single rejection", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    expect(screen.queryByText("Force Push All")).not.toBeInTheDocument();
    expect(screen.queryByText("Discard All")).not.toBeInTheDocument();
  });

  it("calls onForcePush with all IDs on bulk force push", async () => {
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

    fireEvent.click(screen.getByText("Force Push All"));
    await waitFor(() => {
      expect(onForcePush).toHaveBeenCalledWith(["note-1", "note-2"]);
    });
  });

  it("calls onDiscard with all IDs on bulk discard", async () => {
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

    fireEvent.click(screen.getByText("Discard All"));
    await waitFor(() => {
      expect(onDiscard).toHaveBeenCalledWith(["note-1", "note-2"]);
    });
  });

  it("calls onClose when Close button is clicked", () => {
    render(<SyncIssuesDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Close"));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
