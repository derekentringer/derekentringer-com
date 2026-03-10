import type { Root, Text, PhrasingContent } from "mdast";
import type { Plugin } from "unified";

interface RemarkWikiLinkOptions {
  /** Map of lowercase title → noteId for resolved links */
  titleMap: Map<string, string>;
}

/**
 * Remark plugin that transforms [[title]] wiki-link syntax in text nodes.
 * Resolved links become <a> elements with data-wiki-link attribute.
 * Unresolved links become <span> elements with wiki-link-broken class.
 */
const remarkWikiLink: Plugin<[RemarkWikiLinkOptions], Root> = (options) => {
  const { titleMap } = options;

  return (tree) => {
    visitTextNodes(tree, titleMap);
  };
};

function visitTextNodes(node: Root | PhrasingContent | { children?: unknown[] }, titleMap: Map<string, string>) {
  if (!("children" in node) || !Array.isArray(node.children)) return;

  const newChildren: unknown[] = [];
  let changed = false;

  for (const child of node.children) {
    if ((child as { type: string }).type === "text") {
      const textNode = child as Text;
      const parts = splitWikiLinks(textNode.value, titleMap);
      if (parts.length === 1 && parts[0].type === "text") {
        newChildren.push(child);
      } else {
        newChildren.push(...parts);
        changed = true;
      }
    } else {
      // Recurse into non-text children
      visitTextNodes(child as { children?: unknown[] }, titleMap);
      newChildren.push(child);
    }
  }

  if (changed) {
    (node as { children: unknown[] }).children = newChildren;
  }
}

function splitWikiLinks(
  text: string,
  titleMap: Map<string, string>,
): PhrasingContent[] {
  const regex = /\[\[([^\[\]]+?)\]\]/g;
  const result: PhrasingContent[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      result.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const linkText = match[1].trim();
    const noteId = titleMap.get(linkText.toLowerCase());

    if (noteId) {
      // Resolved link → <a> with data attribute
      result.push({
        type: "link",
        url: "#",
        data: {
          hProperties: {
            "data-wiki-link": noteId,
            className: "wiki-link",
          },
        },
        children: [{ type: "text", value: linkText }],
      } as unknown as PhrasingContent);
    } else {
      // Unresolved link → <emphasis> with broken class (rendered as <em>)
      result.push({
        type: "emphasis",
        data: {
          hName: "span",
          hProperties: {
            className: "wiki-link-broken",
          },
        },
        children: [{ type: "text", value: `[[${linkText}]]` }],
      } as unknown as PhrasingContent);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (result.length === 0) {
    result.push({ type: "text", value: text });
  }

  return result;
}

export { remarkWikiLink };
export type { RemarkWikiLinkOptions };
