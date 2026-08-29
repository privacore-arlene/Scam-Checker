import { useEffect } from "react";

const PARENT_ORIGIN = "https://thefrauddoctor.ca";

/**
 * Reports the page's content height to the parent window so the embedding
 * iframe on thefrauddoctor.ca can resize itself. No-op when not embedded.
 */
export function EmbedHeightReporter() {
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;

    let last = 0;

    const send = () => {
      const height = document.documentElement.scrollHeight;
      if (height === last) return;
      last = height;
      try {
        window.parent.postMessage({ type: "frauddoctor-resize", height }, PARENT_ORIGIN);
      } catch {
        /* ignore cross-origin failures */
      }
    };

    send();

    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    window.addEventListener("load", send);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", send);
    };
  }, []);

  return null;
}
