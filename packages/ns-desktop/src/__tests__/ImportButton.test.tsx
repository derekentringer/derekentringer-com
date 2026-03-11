import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { ImportButton } from "../components/ImportButton.tsx";

describe("ImportButton", () => {
  it("renders an upload icon button", () => {
    render(<ImportButton onImportFiles={vi.fn()} onImportDirectory={vi.fn()} />);
    const button = screen.getByTitle("Import");
    expect(button).toBeInTheDocument();
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("opens dropdown on click with import options", () => {
    render(<ImportButton onImportFiles={vi.fn()} onImportDirectory={vi.fn()} />);
    const button = screen.getByTitle("Import");
    fireEvent.click(button);
    expect(screen.getByText("Import Files")).toBeInTheDocument();
    expect(screen.getByText("Import Folder")).toBeInTheDocument();
  });

  it("clicking Import Files triggers file input", () => {
    const onImportFiles = vi.fn();
    render(<ImportButton onImportFiles={onImportFiles} onImportDirectory={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Import"));
    const importFilesButton = screen.getByText("Import Files");

    // The button should close the dropdown and click the hidden input
    const clickSpy = vi.fn();
    const fileInput = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    fileInput.click = clickSpy;

    fireEvent.click(importFilesButton);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("closes dropdown when clicking outside", () => {
    render(<ImportButton onImportFiles={vi.fn()} onImportDirectory={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Import"));
    expect(screen.getByText("Import Files")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Import Files")).not.toBeInTheDocument();
  });
});
