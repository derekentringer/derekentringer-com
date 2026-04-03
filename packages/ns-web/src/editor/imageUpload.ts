import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type);
}

function insertText(view: EditorView, text: string, pos?: number): void {
  const at = pos ?? view.state.selection.main.head;
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
  });
}

function replaceText(
  view: EditorView,
  search: string,
  replacement: string,
): void {
  const doc = view.state.doc.toString();
  const idx = doc.indexOf(search);
  if (idx === -1) return;
  view.dispatch({
    changes: { from: idx, to: idx + search.length, insert: replacement },
  });
}

async function handleImageUpload(
  view: EditorView,
  file: File,
  onUpload: (file: File) => Promise<string>,
  pos?: number,
): Promise<void> {
  const placeholder = `![Uploading ${file.name}...]()`;
  insertText(view, placeholder, pos);

  try {
    const url = await onUpload(file);
    const name = file.name.replace(/\.[^.]+$/, "");
    replaceText(view, placeholder, `![${name}](${url})`);
  } catch {
    replaceText(view, placeholder, "");
  }
}

export function imageUploadExtension(
  onUpload: (file: File) => Promise<string>,
): Extension {
  if (!EditorView.domEventHandlers) return [];
  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData?.items;
      if (!items) return false;

      for (const item of items) {
        if (item.kind === "file" && isImageFile(item.getAsFile()!)) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            handleImageUpload(view, file, onUpload);
            return true;
          }
        }
      }
      return false;
    },

    drop(event, view) {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;

      const imageFiles = Array.from(files).filter(isImageFile);
      if (imageFiles.length === 0) return false;

      event.preventDefault();
      const dropPos = view.posAtCoords({
        x: event.clientX,
        y: event.clientY,
      });

      for (const file of imageFiles) {
        handleImageUpload(view, file, onUpload, dropPos ?? undefined);
      }
      return true;
    },
  });
}
