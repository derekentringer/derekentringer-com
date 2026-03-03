interface ResizeDividerProps {
  direction: "horizontal" | "vertical";
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}

export function ResizeDivider({ direction, isDragging, onPointerDown }: ResizeDividerProps) {
  const isHorizontal = direction === "horizontal";

  return (
    <div
      onPointerDown={onPointerDown}
      className={`
        shrink-0 flex items-center justify-center group
        ${isHorizontal ? "h-1.5 cursor-row-resize" : "w-1.5 cursor-col-resize"}
      `}
      style={{ touchAction: "none" }}
    >
      <div
        className={`
          ${isHorizontal ? "h-px w-full" : "w-px h-full"}
          ${isDragging ? "bg-ring" : "bg-border group-hover:bg-muted-foreground"}
          transition-colors
        `}
      />
    </div>
  );
}
