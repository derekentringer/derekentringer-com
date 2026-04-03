import { useCallback, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import type { PluggableList } from "unified";
import { CodeBlock } from "./CodeBlock.tsx";
import { InteractiveTable } from "./InteractiveTable.tsx";
import { ResizableImage } from "./ResizableImage.tsx";
import { remarkWikiLink } from "../lib/remarkWikiLink.ts";
import { findTables } from "../lib/tableMarkdown.ts";
import { toggleCheckbox } from "../lib/toggleCheckbox.ts";
import { findImages, parseAltDimensions } from "../lib/imageMarkdown.ts";

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
  // Refs keep component overrides stable across content changes,
  // preventing React from remounting InteractiveTable (which would lose sort state)
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  contentRef.current = content;
  onContentChangeRef.current = onContentChange;

  const plugins = useMemo((): PluggableList => {
    const base: PluggableList = [remarkGfm];
    if (wikiLinkTitleMap) {
      base.push([remarkWikiLink, { titleMap: wikiLinkTitleMap }]);
    }
    return base;
  }, [wikiLinkTitleMap]);

  const markdownComponents = useMemo(() => {
    const components: Record<string, React.ElementType> = {
      pre: CodeBlock,
      img: ({ src, alt, node, ...props }: React.ComponentPropsWithoutRef<"img"> & { node?: { position?: { start: { offset?: number } } } }) => {
        const parsedAlt = parseAltDimensions(alt ?? "");
        if (onContentChangeRef.current && src) {
          const currentContent = contentRef.current;
          const images = findImages(currentContent);
          const offset = node?.position?.start?.offset;
          let imageIndex = offset != null
            ? images.findIndex((img) => img.startOffset === offset)
            : -1;
          if (imageIndex === -1) {
            imageIndex = images.findIndex((img) => img.src === src);
          }
          if (imageIndex !== -1) {
            return (
              <ResizableImage
                src={src}
                alt={alt ?? ""}
                content={currentContent}
                onContentChange={onContentChangeRef.current}
                imageIndex={imageIndex}
              />
            );
          }
        }
        const style: React.CSSProperties = parsedAlt.width
          ? { width: parsedAlt.width, height: parsedAlt.height ?? "auto", borderRadius: "6px" }
          : { maxWidth: "100%", height: "auto", borderRadius: "6px" };
        return <img src={src} alt={parsedAlt.text} loading="lazy" {...props} style={style} />;
      },
    };
    if (onContentChange) {
      components.table = ({
        children,
        node,
        ...props
      }: React.ComponentPropsWithoutRef<"table"> & { node?: { position?: { start: { line: number } } } }) => {
        const currentContent = contentRef.current;
        const currentOnChange = onContentChangeRef.current!;
        const tables = findTables(currentContent);
        const startLine = node?.position?.start?.line;
        const tableIndex =
          startLine != null
            ? tables.findIndex((t) => t.startLine === startLine - 1)
            : -1;
        if (tableIndex === -1) {
          return <table {...props}>{children}</table>;
        }
        return (
          <InteractiveTable
            content={currentContent}
            onContentChange={currentOnChange}
            tableIndex={tableIndex}
          >
            {children}
          </InteractiveTable>
        );
      };
      components.input = ({ type, checked, ...props }: React.ComponentPropsWithoutRef<"input">) => {
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
              if (idx >= 0) onContentChangeRef.current!(toggleCheckbox(contentRef.current, idx));
            }}
            className="cursor-pointer"
          />
        );
      };
    }
    return components;
  }, [!!onContentChange]);

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
      <ReactMarkdown remarkPlugins={plugins} rehypePlugins={[rehypeSlug, rehypeHighlight]} components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}
