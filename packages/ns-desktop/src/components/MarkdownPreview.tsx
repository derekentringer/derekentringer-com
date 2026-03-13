import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { remarkWikiLink } from "../lib/remarkWikiLink.ts";
import { toggleCheckbox } from "../lib/toggleCheckbox.ts";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  wikiLinkTitleMap?: Map<string, string>;
  onWikiLinkClick?: (noteId: string) => void;
  onContentChange?: (newContent: string) => void;
}

export function MarkdownPreview({
  content,
  className,
  wikiLinkTitleMap,
  onWikiLinkClick,
  onContentChange,
}: MarkdownPreviewProps) {
  const plugins = useMemo((): PluggableList => {
    const base: PluggableList = [remarkGfm];
    if (wikiLinkTitleMap) {
      base.push([remarkWikiLink, { titleMap: wikiLinkTitleMap }]);
    }
    return base;
  }, [wikiLinkTitleMap]);

  const markdownComponents = useMemo(() => {
    if (!onContentChange) return undefined;
    return {
      input: ({ type, checked, ...props }: React.ComponentPropsWithoutRef<"input">) => {
        if (type !== "checkbox") return <input type={type} checked={checked} {...props} />;
        return (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              const container = (e.target as HTMLElement).closest(".markdown-preview");
              if (!container) return;
              const allCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
              const idx = allCheckboxes.indexOf(e.target as HTMLInputElement);
              if (idx >= 0) onContentChange(toggleCheckbox(content, idx));
            }}
            className="cursor-pointer"
          />
        );
      },
    };
  }, [content, onContentChange]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const link = target.closest("[data-wiki-link]");
      if (link && onWikiLinkClick) {
        e.preventDefault();
        const noteId = link.getAttribute("data-wiki-link");
        if (noteId) {
          onWikiLinkClick(noteId);
        }
      }
    },
    [onWikiLinkClick],
  );

  return (
    <div
      className={`markdown-preview ${className ?? ""}`}
      onClick={handleClick}
    >
      <ReactMarkdown remarkPlugins={plugins} components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}
