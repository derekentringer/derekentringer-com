import { useMemo } from "react";
import { extractHeadings } from "../lib/extractHeadings.ts";

interface TocPanelProps {
  content: string;
  onHeadingClick: (slug: string, lineNumber: number) => void;
}

export function TocPanel({ content, onHeadingClick }: TocPanelProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);

  if (headings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-background h-full" data-testid="toc-panel">
        <span className="text-sm text-muted-foreground">No headings found</span>
      </div>
    );
  }

  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div className="flex flex-col h-full bg-background" data-testid="toc-panel">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Table of Contents
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {headings.map((heading, i) => (
          <button
            key={`${heading.slug}-${i}`}
            onClick={() => onHeadingClick(heading.slug, heading.lineNumber)}
            className="w-full text-left py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors cursor-pointer truncate"
            style={{ paddingLeft: (heading.level - minLevel) * 16 + 12 }}
            title={heading.text}
            data-testid="toc-item"
          >
            {heading.text}
          </button>
        ))}
      </div>
    </div>
  );
}
