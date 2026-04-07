import { extractHeadings } from "./extractHeadings.ts";
import { findTables } from "./tableMarkdown.ts";

/**
 * Maps a clicked DOM element in the rendered markdown preview back to a
 * 1-indexed source line number. Returns 0 if no mapping is found.
 */
export function findSourceLine(
  content: string,
  clickedElement: HTMLElement,
  container: HTMLElement,
): number {
  // Walk up from the clicked element looking for a mappable ancestor
  let el: HTMLElement | null = clickedElement;
  while (el && el !== container) {
    // Headings (most reliable — slug matches rehype-slug output)
    if (/^H[1-6]$/.test(el.tagName) && el.id) {
      const headings = extractHeadings(content);
      const match = headings.find((h) => h.slug === el!.id);
      if (match) return match.lineNumber;
    }

    // Images — match by src URL
    if (el.tagName === "IMG") {
      const src = (el as HTMLImageElement).src;
      const line = findImageLine(content, src);
      if (line > 0) return line;
    }

    // Code blocks — match by text content
    if (el.tagName === "PRE") {
      const codeText = (el.textContent ?? "").trim();
      const line = findCodeBlockLine(content, codeText);
      if (line > 0) return line;
    }

    // Tables — match by index (tables have reliable 1:1 mapping via findTables)
    if (el.tagName === "TABLE") {
      return findTableLine(content, container, el);
    }

    // List items — match by index with text fallback
    if (el.tagName === "LI") {
      const line = findListItemLine(content, container, el);
      if (line > 0) return line;
    }

    // Horizontal rules
    if (el.tagName === "HR") {
      const line = findHrLine(content, container, el);
      if (line > 0) return line;
    }

    // Blockquotes — match by text content
    if (el.tagName === "BLOCKQUOTE") {
      const bqText = (el.textContent ?? "").trim();
      const line = findBlockquoteLine(content, bqText);
      if (line > 0) return line;
    }

    // Paragraphs — match by text content
    if (el.tagName === "P") {
      const pText = (el.textContent ?? "").trim();
      const line = findParagraphLineByText(content, pText);
      if (line > 0) return line;
    }

    el = el.parentElement;
  }

  return 0;
}

/** Find the source line of an image by matching its src URL. */
function findImageLine(content: string, src: string): number {
  if (!src) return 0;
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}```/.test(lines[i])) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    // Match ![...](url) where url matches the src (src may be absolute, url may be relative)
    const imgMatch = lines[i].match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (imgMatch) {
      const url = imgMatch[1];
      // Check if the src ends with the markdown URL (handles relative vs absolute)
      if (src === url || src.endsWith(url) || url.endsWith(src) || src.includes(url)) {
        return i + 1;
      }
    }
  }

  return 0;
}

/** Find the source line of a fenced code block by matching its text content. */
function findCodeBlockLine(content: string, codeText: string): number {
  if (!codeText) return 0;
  const lines = content.split("\n");
  let inBlock = false;
  let blockStart = 0;
  let blockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}```/.test(lines[i])) {
      if (!inBlock) {
        inBlock = true;
        blockStart = i;
        blockLines = [];
      } else {
        const blockText = blockLines.join("\n").trim();
        if (blockText === codeText || blockText.includes(codeText) || codeText.includes(blockText)) {
          return blockStart + 1; // 1-indexed
        }
        inBlock = false;
      }
      continue;
    }
    if (inBlock) blockLines.push(lines[i]);
  }

  return 0;
}

/** Find the source line of a table by its index among rendered tables. */
function findTableLine(
  content: string,
  container: HTMLElement,
  tableElement: HTMLElement,
): number {
  const allTables = container.querySelectorAll("table");
  let tableIndex = -1;
  for (let i = 0; i < allTables.length; i++) {
    if (allTables[i] === tableElement) { tableIndex = i; break; }
  }

  const tables = findTables(content);
  if (tableIndex >= 0 && tableIndex < tables.length) {
    return tables[tableIndex].startLine + 1; // convert 0-indexed to 1-indexed
  }

  return 0;
}

/** Find the source line of a list item by its DOM index among all <li> elements. */
function findListItemLine(
  content: string,
  container: HTMLElement,
  liElement: HTMLElement,
): number {
  const allLis = container.querySelectorAll("li");
  let liIndex = -1;
  for (let i = 0; i < allLis.length; i++) {
    if (allLis[i] === liElement) { liIndex = i; break; }
  }
  if (liIndex < 0) return 0;

  const lines = content.split("\n");
  let listItemCount = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}```/.test(lines[i])) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (/^\s*(?:[-*+]\s|\d+\.\s)/.test(lines[i])) {
      if (listItemCount === liIndex) return i + 1;
      listItemCount++;
    }
  }

  return 0;
}

/** Find the source line of a paragraph by matching its text content. */
function findParagraphLineByText(content: string, pText: string): number {
  if (!pText) return 0;
  const lines = content.split("\n");
  let inCodeBlock = false;
  // Normalize: collapse whitespace for comparison
  const normalizedTarget = pText.replace(/\s+/g, " ").toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}```/.test(lines[i])) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    const line = lines[i];
    if (line.trim() === "") continue;
    // Skip lines that are clearly not paragraphs
    if (/^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\||```)/.test(line)) continue;

    const lineText = stripInlineMarkdown(line.trim()).replace(/\s+/g, " ").toLowerCase();
    if (normalizedTarget.startsWith(lineText) || lineText.startsWith(normalizedTarget)) {
      return i + 1;
    }
  }

  return 0;
}

/** Find the source line of a horizontal rule by its index among rendered HRs. */
function findHrLine(
  content: string,
  container: HTMLElement,
  hrElement: HTMLElement,
): number {
  const allHrs = container.querySelectorAll("hr");
  let hrIndex = -1;
  for (let i = 0; i < allHrs.length; i++) {
    if (allHrs[i] === hrElement) { hrIndex = i; break; }
  }
  if (hrIndex < 0) return 0;

  const lines = content.split("\n");
  let inCodeBlock = false;
  let hrCount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}```/.test(lines[i])) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (/^\s{0,3}([-*_])\s*\1\s*\1[\s\-*_]*$/.test(lines[i])) {
      if (hrCount === hrIndex) return i + 1;
      hrCount++;
    }
  }

  return 0;
}

/** Find the source line of a blockquote by matching its text content. */
function findBlockquoteLine(content: string, bqText: string): number {
  if (!bqText) return 0;
  const lines = content.split("\n");
  let inCodeBlock = false;
  const normalizedTarget = bqText.replace(/\s+/g, " ").toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{0,3}```/.test(lines[i])) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;

    if (/^\s*>\s?/.test(lines[i])) {
      // Collect the full blockquote text (consecutive > lines)
      const bqLines: string[] = [];
      let j = i;
      while (j < lines.length && /^\s*>\s?/.test(lines[j])) {
        bqLines.push(lines[j].replace(/^\s*>\s?/, ""));
        j++;
      }
      const bqContent = stripInlineMarkdown(bqLines.join(" ").trim())
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (bqContent === normalizedTarget || normalizedTarget.startsWith(bqContent) || bqContent.startsWith(normalizedTarget)) {
        return i + 1;
      }
    }
  }

  return 0;
}

/** Strip inline markdown formatting for text comparison. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links
    .replace(/\[\[([^\]]+)\]\]/g, "$1")        // wiki-links
    .replace(/`([^`]+)`/g, "$1")               // inline code
    .replace(/\*\*(.+?)\*\*/g, "$1")           // bold
    .replace(/__(.+?)__/g, "$1")               // bold alt
    .replace(/\*(.+?)\*/g, "$1")               // italic
    .replace(/_(.+?)_/g, "$1")                  // italic alt
    .replace(/~~(.+?)~~/g, "$1");               // strikethrough
}
