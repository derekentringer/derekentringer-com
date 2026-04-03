export interface ParsedImageDimensions {
  text: string;
  width: number | null;
  height: number | null;
}

export interface ParsedImage {
  alt: string;
  src: string;
  width: number | null;
  height: number | null;
  startOffset: number;
  endOffset: number;
  raw: string;
}

export function parseAltDimensions(alt: string): ParsedImageDimensions {
  const pipeIdx = alt.lastIndexOf("|");
  if (pipeIdx === -1) return { text: alt, width: null, height: null };

  const dimStr = alt.slice(pipeIdx + 1).trim();
  const text = alt.slice(0, pipeIdx);

  const wxh = dimStr.match(/^(\d+)x(\d+)$/);
  if (wxh) {
    return { text, width: parseInt(wxh[1], 10), height: parseInt(wxh[2], 10) };
  }

  const wOnly = dimStr.match(/^(\d+)$/);
  if (wOnly) {
    return { text, width: parseInt(wOnly[1], 10), height: null };
  }

  // Not a valid dimension — treat entire alt as text
  return { text: alt, width: null, height: null };
}

export function serializeImageAlt(
  text: string,
  width: number | null,
  height: number | null,
): string {
  if (width !== null && height !== null) return `${text}|${width}x${height}`;
  if (width !== null) return `${text}|${width}`;
  return text;
}

export function findImages(markdown: string): ParsedImage[] {
  const images: ParsedImage[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  // Track fenced code blocks to skip images inside them
  let inCodeBlock = false;
  const lines = markdown.split("\n");
  const codeBlockRanges: { start: number; end: number }[] = [];
  let offset = 0;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        // Closing fence
        codeBlockRanges[codeBlockRanges.length - 1].end = offset + line.length;
        inCodeBlock = false;
      } else {
        // Opening fence
        codeBlockRanges.push({ start: offset, end: Infinity });
        inCodeBlock = true;
      }
    }
    offset += line.length + 1; // +1 for \n
  }

  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const startOffset = match.index;
    const endOffset = match.index + match[0].length;

    // Skip if inside a code block
    const inCode = codeBlockRanges.some(
      (r) => startOffset >= r.start && startOffset < r.end,
    );
    if (inCode) continue;

    const alt = match[1];
    const src = match[2];
    const { width, height } = parseAltDimensions(alt);

    images.push({
      alt,
      src,
      width,
      height,
      startOffset,
      endOffset,
      raw: match[0],
    });
  }

  return images;
}

export function updateImageDimensions(
  markdown: string,
  imageIndex: number,
  width: number,
  height?: number,
): string {
  const images = findImages(markdown);
  if (imageIndex < 0 || imageIndex >= images.length) return markdown;

  const image = images[imageIndex];
  const { text } = parseAltDimensions(image.alt);
  const newAlt = serializeImageAlt(text, width, height ?? null);
  const newMarkdown = `![${newAlt}](${image.src})`;

  return (
    markdown.slice(0, image.startOffset) +
    newMarkdown +
    markdown.slice(image.endOffset)
  );
}
