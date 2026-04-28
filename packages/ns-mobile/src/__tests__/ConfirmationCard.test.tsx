/**
 * ConfirmationCard pure-helper tests (Phase A.4).
 *
 * Mobile doesn't carry @testing-library/react-native, so the React
 * Native rendering itself is exercised by manual testing. The
 * preview-type → headline + body string mapping is the actual logic
 * worth covering — it's pure, decisions branch on the preview.type
 * discriminator, and any future tweak to the user-facing copy needs
 * a regression guard.
 */

import {
  bodyForPreview,
  headlineForPreview,
} from "../components/notes/ConfirmationCard";
import type { ConfirmationPreview } from "../api/ai";

describe("headlineForPreview", () => {
  it("returns the right headline for each preview type", () => {
    const cases: Array<[ConfirmationPreview, string]> = [
      [
        { type: "delete_note", title: "X" },
        "Move note to trash?",
      ],
      [
        { type: "delete_folder", folderName: "F", affectedCount: 0 },
        "Delete folder?",
      ],
      [
        {
          type: "update_note_content",
          title: "X",
          oldContent: "",
          newContent: "",
          oldLen: 0,
          newLen: 0,
        },
        "Rewrite note content?",
      ],
      [
        { type: "rename_note", oldTitle: "A", newTitle: "B" },
        "Rename note?",
      ],
      [
        { type: "rename_folder", oldName: "A", newName: "B" },
        "Rename folder?",
      ],
      [
        { type: "rename_tag", oldName: "a", newName: "b", affectedCount: 0 },
        "Rename tag?",
      ],
    ];
    for (const [preview, expected] of cases) {
      expect(headlineForPreview(preview)).toBe(expected);
    }
  });
});

describe("bodyForPreview", () => {
  it("delete_note: emphasizes the title and includes the folder name", () => {
    const body = bodyForPreview({
      type: "delete_note",
      title: "Foo",
      folder: "Inbox",
    });
    expect(body.emphasized).toBe('"Foo"');
    expect(body.detail).toContain("Inbox");
    expect(body.detail).toContain("Trash");
  });

  it("delete_note: omits the folder phrase when no folder", () => {
    const body = bodyForPreview({ type: "delete_note", title: "Foo" });
    expect(body.emphasized).toBe('"Foo"');
    expect(body.detail).toBe(" will be moved to Trash.");
  });

  it("delete_folder empty: shows '(empty)' instead of count noise", () => {
    const body = bodyForPreview({
      type: "delete_folder",
      folderName: "Trash",
      affectedCount: 0,
    });
    expect(body.detail).toContain("(empty)");
  });

  it("delete_folder with notes: pluralizes correctly", () => {
    const single = bodyForPreview({
      type: "delete_folder",
      folderName: "F",
      affectedCount: 1,
    });
    expect(single.detail).toContain("1 note inside");
    const many = bodyForPreview({
      type: "delete_folder",
      folderName: "F",
      affectedCount: 5,
    });
    expect(many.detail).toContain("5 notes inside");
  });

  it("update_note_content: includes signed delta + old → new lengths", () => {
    const grew = bodyForPreview({
      type: "update_note_content",
      title: "Foo",
      oldContent: "",
      newContent: "",
      oldLen: 100,
      newLen: 250,
    });
    expect(grew.detail).toContain("+150 chars");
    expect(grew.detail).toContain("100 → 250");

    const shrank = bodyForPreview({
      type: "update_note_content",
      title: "Foo",
      oldContent: "",
      newContent: "",
      oldLen: 250,
      newLen: 100,
    });
    expect(shrank.detail).toContain("-150 chars");
  });

  it("rename_note: shows old → new + optional folder", () => {
    const noFolder = bodyForPreview({
      type: "rename_note",
      oldTitle: "A",
      newTitle: "B",
    });
    expect(noFolder.emphasized).toBe('"A"');
    expect(noFolder.detail).toContain('"B"');
    expect(noFolder.detail).not.toContain(" in ");

    const withFolder = bodyForPreview({
      type: "rename_note",
      oldTitle: "A",
      newTitle: "B",
      folder: "Work",
    });
    expect(withFolder.detail).toContain("in Work");
  });

  it("rename_folder: shows old → new", () => {
    const body = bodyForPreview({
      type: "rename_folder",
      oldName: "Old",
      newName: "New",
    });
    expect(body.emphasized).toBe('"Old"');
    expect(body.detail).toContain('"New"');
  });

  it("rename_tag: pluralizes affected count", () => {
    const single = bodyForPreview({
      type: "rename_tag",
      oldName: "a",
      newName: "b",
      affectedCount: 1,
    });
    expect(single.detail).toContain("across 1 note.");
    const many = bodyForPreview({
      type: "rename_tag",
      oldName: "a",
      newName: "b",
      affectedCount: 4,
    });
    expect(many.detail).toContain("across 4 notes.");
  });
});
