declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackPageview(path: string) {
  window.gtag?.("config", "UA-561217-2", { page_path: path });
}
