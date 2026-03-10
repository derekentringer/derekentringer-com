import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../pages/SettingsPage.tsx";
import { useEditorSettings } from "../hooks/useEditorSettings.ts";

beforeEach(() => {
  localStorage.clear();
});

function SettingsPageWrapper(props: {
  onBack: () => void;
  onTrashRetentionChange?: (days: number) => void;
}) {
  const { settings, updateSetting } = useEditorSettings();
  return (
    <SettingsPage
      onBack={props.onBack}
      onTrashRetentionChange={props.onTrashRetentionChange}
      editorSettings={settings}
      updateEditorSetting={updateSetting}
    />
  );
}

function renderSettingsPage(props?: { onTrashRetentionChange?: (days: number) => void }) {
  const onBack = vi.fn();
  const onTrashRetentionChange = props?.onTrashRetentionChange ?? vi.fn();
  const result = render(
    <SettingsPageWrapper onBack={onBack} onTrashRetentionChange={onTrashRetentionChange} />,
  );
  return { ...result, onBack, onTrashRetentionChange };
}

describe("SettingsPage", () => {
  // --- Headings ---

  it("renders Settings heading", () => {
    renderSettingsPage();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders Back button", () => {
    renderSettingsPage();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("renders all section headings", () => {
    renderSettingsPage();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Editor Preferences")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Version History")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  // --- Appearance ---

  it("renders theme radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dark")).toBeInTheDocument();
    expect(screen.getByLabelText("Light")).toBeInTheDocument();
    expect(screen.getByLabelText("System")).toBeInTheDocument();
  });

  it("renders font size slider", () => {
    renderSettingsPage();
    expect(screen.getByLabelText("Editor font size")).toBeInTheDocument();
  });

  it("renders accent color swatches", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Accent color" })).toBeInTheDocument();
    const swatches = screen.getAllByRole("radio").filter(
      (el) => el.closest("[aria-label='Accent color']"),
    );
    expect(swatches.length).toBe(11);
  });

  it("clicking accent color swatch persists to localStorage", async () => {
    renderSettingsPage();
    const blueButton = screen.getByRole("radio", { name: "blue" });
    await userEvent.click(blueButton);
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.accentColor).toBe("blue");
  });

  it("changing theme persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByLabelText("Light"));
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.theme).toBe("light");
  });

  // --- Editor Preferences ---

  it("renders default view mode radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Default view mode" })).toBeInTheDocument();
    expect(screen.getByLabelText("Editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Split")).toBeInTheDocument();
    expect(screen.getByLabelText("Preview")).toBeInTheDocument();
  });

  it("renders line numbers and word wrap toggles", () => {
    renderSettingsPage();
    expect(screen.getByText("Line numbers")).toBeInTheDocument();
    expect(screen.getByText("Word wrap")).toBeInTheDocument();
  });

  it("renders auto-save delay select", () => {
    renderSettingsPage();
    expect(screen.getByLabelText("Auto-save delay")).toBeInTheDocument();
  });

  it("renders tab size radio group", () => {
    renderSettingsPage();
    expect(screen.getByRole("radiogroup", { name: "Tab size" })).toBeInTheDocument();
    expect(screen.getByLabelText("2 spaces")).toBeInTheDocument();
    expect(screen.getByLabelText("4 spaces")).toBeInTheDocument();
  });

  it("changing view mode persists to localStorage", async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByLabelText("Split"));
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.defaultViewMode).toBe("split");
  });

  it("changing auto-save delay persists to localStorage", async () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Auto-save delay");
    await userEvent.selectOptions(select, "2000");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.autoSaveDelay).toBe(2000);
  });

  // --- Trash ---

  it("renders trash retention dropdown with default value", () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Trash retention period");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("30");
  });

  it("changing trash retention updates localStorage", async () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "14");
    expect(localStorage.getItem("ns-desktop:trashRetentionDays")).toBe("14");
  });

  // --- Version History ---

  it("renders version interval dropdown", () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Version capture interval");
    expect(select).toBeInTheDocument();
  });

  it("changing version interval persists to localStorage", async () => {
    renderSettingsPage();
    const select = screen.getByLabelText("Version capture interval");
    await userEvent.selectOptions(select, "30");
    const stored = JSON.parse(localStorage.getItem("ns-editor-settings")!);
    expect(stored.versionIntervalMinutes).toBe(30);
  });

  // --- Keyboard Shortcuts ---

  it("renders Keyboard Shortcuts section", () => {
    renderSettingsPage();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("displays all shortcut descriptions", () => {
    renderSettingsPage();
    expect(screen.getByText("Save note")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Italic")).toBeInTheDocument();
    expect(screen.getByText("Focus search")).toBeInTheDocument();
  });

  // --- Navigation ---

  it("calls onBack when Back button clicked", async () => {
    const { onBack } = renderSettingsPage();
    await userEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onTrashRetentionChange when trash retention changes", async () => {
    const onTrashRetentionChange = vi.fn();
    renderSettingsPage({ onTrashRetentionChange });
    const select = screen.getByLabelText("Trash retention period");
    await userEvent.selectOptions(select, "7");
    expect(onTrashRetentionChange).toHaveBeenCalledWith(7);
  });
});
