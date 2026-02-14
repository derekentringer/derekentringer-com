import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App.tsx";

describe("App", () => {
  it("renders the portfolio page at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("derek entringer")).toBeInTheDocument();
  });

  it("renders the 404 page for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
