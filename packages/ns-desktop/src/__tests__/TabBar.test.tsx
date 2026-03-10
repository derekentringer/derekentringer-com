import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { TabBar, type Tab } from "../components/TabBar.tsx";

const tabs: Tab[] = [
  { id: "1", title: "Note One", isDirty: false, isPreview: false },
  { id: "2", title: "Note Two", isDirty: true, isPreview: false },
  { id: "3", title: "Note Three", isDirty: false, isPreview: false },
];

function DndWrapper({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

function renderTabBar(props: Partial<React.ComponentProps<typeof TabBar>> = {}) {
  return render(
    <DndWrapper>
      <TabBar
        tabs={tabs}
        activeTabId="1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        {...props}
      />
    </DndWrapper>,
  );
}

describe("TabBar", () => {
  it("renders all tab titles", () => {
    renderTabBar();

    expect(screen.getByText("Note One")).toBeInTheDocument();
    expect(screen.getByText("Note Two")).toBeInTheDocument();
    expect(screen.getByText("Note Three")).toBeInTheDocument();
  });

  it("shows dirty indicator for dirty tabs", () => {
    renderTabBar();

    // Tab 2 is dirty — should have the ● indicator
    expect(screen.getByText("●")).toBeInTheDocument();
  });

  it("calls onSelectTab when a tab is clicked", async () => {
    const onSelectTab = vi.fn();
    renderTabBar({ onSelectTab });

    await userEvent.click(screen.getByText("Note Two"));
    expect(onSelectTab).toHaveBeenCalledWith("2");
  });

  it("calls onCloseTab when close button is clicked", async () => {
    const onCloseTab = vi.fn();
    renderTabBar({ onCloseTab });

    await userEvent.click(screen.getByLabelText("Close Note Two"));
    expect(onCloseTab).toHaveBeenCalledWith("2");
  });

  it("does not call onSelectTab when close button is clicked", async () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    renderTabBar({ onSelectTab, onCloseTab });

    await userEvent.click(screen.getByLabelText("Close Note Three"));
    expect(onCloseTab).toHaveBeenCalledWith("3");
    expect(onSelectTab).not.toHaveBeenCalled();
  });

  it("applies active styling to active tab", () => {
    renderTabBar({ activeTabId: "2" });

    const activeTab = screen.getByText("Note Two").closest("button")!;
    expect(activeTab.className).toContain("bg-card");
    expect(activeTab.className).toContain("border-primary");
  });

  it("applies inactive styling to non-active tabs", () => {
    renderTabBar({ activeTabId: "2" });

    const inactiveTab = screen.getByText("Note One").closest("button")!;
    expect(inactiveTab.className).toContain("bg-background");
    expect(inactiveTab.className).toContain("border-transparent");
  });

  it("closes tab on middle-click", () => {
    const onCloseTab = vi.fn();
    renderTabBar({ onCloseTab });

    const tab = screen.getByText("Note Three").closest("button")!;
    fireEvent.mouseDown(tab, { button: 1 });
    expect(onCloseTab).toHaveBeenCalledWith("3");
  });

  it("renders 'Untitled' for tabs with empty title", () => {
    const tabsWithEmpty: Tab[] = [{ id: "1", title: "", isDirty: false, isPreview: false }];
    render(
      <DndWrapper>
        <TabBar tabs={tabsWithEmpty} activeTabId="1" onSelectTab={vi.fn()} onCloseTab={vi.fn()} />
      </DndWrapper>,
    );

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("italicizes preview tab title", () => {
    const previewTabs: Tab[] = [
      { id: "1", title: "Permanent", isDirty: false, isPreview: false },
      { id: "2", title: "Preview", isDirty: false, isPreview: true },
    ];
    render(
      <DndWrapper>
        <TabBar tabs={previewTabs} activeTabId="2" onSelectTab={vi.fn()} onCloseTab={vi.fn()} />
      </DndWrapper>,
    );

    const previewTitle = screen.getByText("Preview").closest("span")!;
    expect(previewTitle.className).toContain("italic");

    const permanentTitle = screen.getByText("Permanent").closest("span")!;
    expect(permanentTitle.className).not.toContain("italic");
  });

  it("calls onPinTab when double-clicking a preview tab", async () => {
    const onPinTab = vi.fn();
    const previewTabs: Tab[] = [
      { id: "1", title: "Preview Note", isDirty: false, isPreview: true },
    ];
    render(
      <DndWrapper>
        <TabBar tabs={previewTabs} activeTabId="1" onSelectTab={vi.fn()} onCloseTab={vi.fn()} onPinTab={onPinTab} />
      </DndWrapper>,
    );

    await userEvent.dblClick(screen.getByText("Preview Note"));
    expect(onPinTab).toHaveBeenCalledWith("1");
  });
});
