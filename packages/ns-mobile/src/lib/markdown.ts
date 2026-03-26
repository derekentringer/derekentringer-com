export function stripMarkdown(text: string): string {
  return text
    // Remove code blocks (before inline code to avoid partial matching)
    .replace(/```[\s\S]*?```/g, "")
    // Remove headings
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove images (before links to avoid partial matching)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove links but keep text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove strikethrough
    .replace(/~~([^~]+)~~/g, "$1")
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    // Collapse multiple newlines/spaces
    .replace(/\n{2,}/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}
