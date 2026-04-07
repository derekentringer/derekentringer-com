import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import type { PluggableList } from "unified";
import { CodeBlock } from "./CodeBlock.tsx";
import { InteractiveTable } from "./InteractiveTable.tsx";
import { ResizableImage } from "./ResizableImage.tsx";
import { ImageLightbox } from "./ImageLightbox.tsx";
import { remarkWikiLink } from "../lib/remarkWikiLink.ts";
import { findTables } from "../lib/tableMarkdown.ts";
import { toggleCheckbox } from "../lib/toggleCheckbox.ts";
import { findImages, parseAltDimensions } from "../lib/imageMarkdown.ts";
import { findSourceLine } from "../lib/sourceMap.ts";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  wikiLinkTitleMap?: Map<string, string>;
  onWikiLinkClick?: (noteId: string) => void;
  onContentChange?: (newContent: string) => void;
  onEditAtLine?: (lineNumber: number) => void;
}

export function MarkdownPreview({
  content,
  className,
  wikiLinkTitleMap,
  onWikiLinkClick,
  onContentChange,
  onEditAtLine,
}: MarkdownPreviewProps) {
  // Refs keep component overrides stable across content changes,
  // preventing React from remounting InteractiveTable (which would lose sort state)
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  contentRef.current = content;
  onContentChangeRef.current = onContentChange;

  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);
  const [imgCtxMenu, setImgCtxMenu] = useState<{ src: string; alt: string; x: number; y: number } | null>(null);
  const imgCtxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgCtxMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (imgCtxMenuRef.current && !imgCtxMenuRef.current.contains(e.target as Node)) {
        setImgCtxMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [imgCtxMenu]);

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
      a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) => {
        const isWiki = href?.startsWith("#wiki:");
        return (
          <a href={href} className={isWiki ? "wiki-link" : undefined} {...props}>
            {children}
          </a>
        );
      },
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
        return (
          <span className="image-inline-wrapper">
            <img
              src={src}
              alt={parsedAlt.text}
              loading="lazy"
              {...props}
              style={style}
              className="cursor-pointer"
              onDoubleClick={() => src && setLightboxSrc({ src, alt: parsedAlt.text })}
              onContextMenu={(e) => { if (src) { e.preventDefault(); setImgCtxMenu({ src, alt: alt ?? "", x: e.clientX, y: e.clientY }); } }}
            />
          </span>
        );
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

      // Check for wiki-link via data attribute
      const link = target.closest("[data-wiki-link]");
      if (link && onWikiLinkClick) {
        e.preventDefault();
        const noteId = link.getAttribute("data-wiki-link");
        if (noteId) {
          onWikiLinkClick(noteId);
          return;
        }
      }

      // Fallback: check for wiki-link via #wiki: URL scheme
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (anchor && onWikiLinkClick) {
        const href = anchor.getAttribute("href") ?? "";
        const wikiMatch = href.match(/^#wiki:(.+)$/);
        if (wikiMatch) {
          e.preventDefault();
          onWikiLinkClick(wikiMatch[1]);
          return;
        }
      }
    },
    [onWikiLinkClick],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onEditAtLine) return;
      const target = e.target as HTMLElement;
      const container = target.closest(".markdown-preview") as HTMLElement;
      if (!container) return;

      let line = findSourceLine(contentRef.current, target, container);
      // Fallback: check if an <hr> is near the click Y position
      // (browsers often report the parent as the target for void elements)
      if (line === 0) {
        const hrs = container.querySelectorAll("hr");
        for (const hr of hrs) {
          const rect = hr.getBoundingClientRect();
          if (Math.abs(e.clientY - (rect.top + rect.height / 2)) < 15) {
            line = findSourceLine(contentRef.current, hr as HTMLElement, container);
            break;
          }
        }
      }
      if (line > 0) onEditAtLine(line);
    },
    [onEditAtLine],
  );

  return (
    <>
      <div
        className={`markdown-preview ${className ?? ""}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <ReactMarkdown remarkPlugins={plugins} rehypePlugins={[rehypeSlug, rehypeHighlight]} components={markdownComponents}>{content}</ReactMarkdown>
      </div>
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc.src}
          alt={lightboxSrc.alt}
          onClose={() => setLightboxSrc(null)}
        />
      )}
      {imgCtxMenu && (
        <div
          ref={imgCtxMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg inline-flex flex-col"
          style={{ left: imgCtxMenu.x, top: imgCtxMenu.y }}
        >
          <button
            onClick={() => { navigator.clipboard.writeText(imgCtxMenu.src); setImgCtxMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Copy Image URL
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(`![${imgCtxMenu.alt}](${imgCtxMenu.src})`); setImgCtxMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Copy Markdown Link
          </button>
          <button
            onClick={async () => {
              const imgSrc = imgCtxMenu.src;
              setImgCtxMenu(null);
              try {
                const res = await fetch(imgSrc);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = imgSrc.split("/").pop() || "image";
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                window.open(imgSrc, "_blank");
              }
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Download
          </button>
        </div>
      )}
    </>
  );
}
