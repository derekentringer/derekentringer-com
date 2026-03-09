import { render } from "@testing-library/react";
import { NsLogo } from "../components/NsLogo.tsx";

describe("NsLogo", () => {
  it("renders an SVG element", () => {
    const { container } = render(<NsLogo />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has correct viewBox", () => {
    const { container } = render(<NsLogo />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 512 512");
  });

  it("applies className prop", () => {
    const { container } = render(<NsLogo className="w-8 h-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-8", "h-8");
  });

  it("renders without className", () => {
    const { container } = render(<NsLogo />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).not.toHaveAttribute("class");
  });
});
