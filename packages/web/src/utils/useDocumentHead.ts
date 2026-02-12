import { useEffect } from "react";

interface HeadOptions {
  title: string;
  meta?: Record<string, string>[];
  links?: Record<string, string>[];
}

export function useDocumentHead({ title, meta, links }: HeadOptions) {
  useEffect(() => {
    document.title = title;

    const addedElements: Element[] = [];

    meta?.forEach((attrs) => {
      const el = document.createElement("meta");
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      addedElements.push(el);
    });

    links?.forEach((attrs) => {
      const el = document.createElement("link");
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      addedElements.push(el);
    });

    return () => {
      addedElements.forEach((el) => el.remove());
    };
  }, [title, meta, links]);
}
