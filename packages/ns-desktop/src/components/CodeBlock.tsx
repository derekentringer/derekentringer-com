import { useState } from "react";
import { MermaidDiagram } from "./MermaidDiagram.tsx";

function getLanguage(children: React.ReactNode): string | null {
  if (
    children &&
    typeof children === "object" &&
    "props" in children
  ) {
    const el = children as React.ReactElement<{ className?: string }>;
    const className = el.props?.className;
    if (typeof className === "string") {
      const match = className.match(/language-(\w+)/);
      return match ? match[1] : null;
    }
  }
  return null;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}

export function CodeBlock({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
  const language = getLanguage(children);

  if (language === "mermaid") {
    return <MermaidDiagram code={extractText(children)} />;
  }

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const code = extractText(children);
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <pre {...props}>{children}</pre>
      <button
        className={`code-block-copy cursor-pointer${copied ? " copied" : ""}`}
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
