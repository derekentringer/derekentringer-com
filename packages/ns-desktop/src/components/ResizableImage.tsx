import { useState, useRef, useCallback, useEffect } from "react";
import { parseAltDimensions, updateImageDimensions } from "../lib/imageMarkdown.ts";
import { ImageLightbox } from "./ImageLightbox.tsx";

interface ResizableImageProps {
  src: string;
  alt: string;
  content: string;
  onContentChange: (content: string) => void;
  imageIndex: number;
}

export function ResizableImage({
  src,
  alt,
  content,
  onContentChange,
  imageIndex,
}: ResizableImageProps) {
  const { text: cleanAlt, width, height } = parseAltDimensions(alt);
  const imgRef = useRef<HTMLImageElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const displayWidth = previewWidth ?? width ?? undefined;
  const displayHeight = previewHeight ?? height ?? undefined;

  // Dismiss context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const img = imgRef.current;
      if (!img) return;

      const startX = e.clientX;
      const startWidth = img.clientWidth;
      const aspectRatio = img.naturalWidth / img.naturalHeight;

      setIsResizing(true);
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";

      function onMouseMove(ev: MouseEvent) {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(50, Math.round(startWidth + delta));
        const newHeight = Math.round(newWidth / aspectRatio);
        setPreviewWidth(newWidth);
        setPreviewHeight(newHeight);
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsResizing(false);

        setPreviewWidth((w) => {
          setPreviewHeight((h) => {
            if (w !== null && h !== null) {
              const updated = updateImageDimensions(content, imageIndex, w, h);
              onContentChange(updated);
            }
            return null;
          });
          return null;
        });
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [content, imageIndex, onContentChange],
  );

  const fullAlt = alt;

  return (
    <>
      <span
        className={`resizable-image-wrapper${isResizing ? " is-resizing" : ""}`}
      >
        <img
          ref={imgRef}
          src={src}
          alt={cleanAlt}
          loading="lazy"
          width={displayWidth}
          height={displayHeight}
          onDoubleClick={() => setLightboxOpen(true)}
          onContextMenu={handleContextMenu}
          className="cursor-pointer"
          style={
            displayWidth
              ? { borderRadius: "6px" }
              : { maxWidth: "100%", height: "auto", borderRadius: "6px" }
          }
        />
        <span
          className="resize-handle cursor-pointer"
          onMouseDown={handleMouseDown}
          title="Drag to resize"
        />
      </span>
      {ctxMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg min-w-[140px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={() => { navigator.clipboard.writeText(src); setCtxMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Copy Image URL
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(`![${fullAlt}](${src})`); setCtxMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Copy Markdown Link
          </button>
          <button
            onClick={async () => {
              setCtxMenu(null);
              try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const { invoke } = await import("@tauri-apps/api/core");
                const rawName = src.split("/").pop() || "image.jpg";
                const ext = rawName.includes(".") ? rawName.split(".").pop()! : "jpg";
                const filename = rawName.includes(".") ? rawName : `${rawName}.${ext}`;
                const extMap: Record<string, string> = { jpg: "JPEG Image", jpeg: "JPEG Image", png: "PNG Image", webp: "WebP Image", gif: "GIF Image" };
                const savePath = await save({
                  defaultPath: filename,
                  filters: [{ name: extMap[ext] || "Image", extensions: [ext] }],
                });
                if (savePath) {
                  await invoke("download_file", { url: src, savePath });
                }
              } catch (err) {
                console.error("Image download failed:", err);
              }
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Download
          </button>
        </div>
      )}
      {lightboxOpen && (
        <ImageLightbox
          src={src}
          alt={cleanAlt}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
