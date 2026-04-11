import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  code: string;
}

function getEffectiveTheme(): "dark" | "light" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light") return "light";
  if (attr === "dark") return "dark";
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

let idCounter = 0;

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [theme, setTheme] = useState(getEffectiveTheme);
  const idRef = useRef(`mermaid-${++idCounter}`);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getEffectiveTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    let mq: MediaQueryList | null = null;
    const handler = () => setTheme(getEffectiveTheme());
    if (typeof window.matchMedia === "function") {
      mq = window.matchMedia("(prefers-color-scheme: light)");
      mq.addEventListener("change", handler);
    }
    return () => {
      observer.disconnect();
      mq?.removeEventListener("change", handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === "dark" ? "dark" : "default",
        });
        const { svg: rendered } = await mermaid.render(idRef.current, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (err) {
        // Dynamic import chunk failure after deploy — reload to get fresh assets
        if (err instanceof TypeError && String(err.message).includes("dynamically imported module")) {
          window.location.reload();
          return;
        }
        if (!cancelled) {
          setSvg("");
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [code, theme]);

  if (error) {
    return (
      <div className="mermaid-error">
        <pre><code>{code}</code></pre>
        <p className="mermaid-error-message">{error}</p>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-loading">Loading diagram...</div>;
  }

  return (
    <div
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
