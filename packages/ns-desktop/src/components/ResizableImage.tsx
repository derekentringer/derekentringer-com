import { useState, useRef, useCallback } from "react";
import { parseAltDimensions, updateImageDimensions } from "../lib/imageMarkdown.ts";

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
  const [isResizing, setIsResizing] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);

  const displayWidth = previewWidth ?? width ?? undefined;
  const displayHeight = previewHeight ?? height ?? undefined;

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

        // Commit dimensions to markdown
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

  return (
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
  );
}
