jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));
jest.mock("@/api/images", () => ({
  uploadImage: jest.fn(),
}));

import { deriveImageTitle } from "../lib/shareImageUpload";

describe("deriveImageTitle", () => {
  it("returns 'Shared image' for an empty filename", () => {
    expect(deriveImageTitle("")).toBe("Shared image");
    expect(deriveImageTitle("   ")).toBe("Shared image");
    expect(deriveImageTitle(undefined)).toBe("Shared image");
  });

  it("strips a single trailing extension", () => {
    expect(deriveImageTitle("IMG_1234.jpg")).toBe("IMG_1234");
    expect(deriveImageTitle("Screenshot 2026-05-08.png")).toBe(
      "Screenshot 2026-05-08",
    );
  });

  it("only strips the last segment after the final dot", () => {
    expect(deriveImageTitle("photo.final.jpeg")).toBe("photo.final");
  });

  it("preserves dotfiles (no leading-dot stripping)", () => {
    expect(deriveImageTitle(".hidden")).toBe(".hidden");
  });

  it("returns the trimmed name for filenames without an extension", () => {
    expect(deriveImageTitle("vacation")).toBe("vacation");
  });
});
