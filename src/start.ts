import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequestHost, setResponseHeader } from "@tanstack/react-start/server";

/**
 * Allow only the official website to embed the Scam Checker.
 * frame-ancestors is used (never X-Frame-Options) so thefrauddoctor.ca can embed it.
 * The Lovable editor preview also embeds the app in an iframe, so preview/dev
 * hosts are exempt to keep development and testing usable.
 */
function isDevOrPreviewHost(host: string) {
  return (
    host.includes("preview--") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.includes("-dev.lovable.app") ||
    host.includes(".lovableproject.com")
  );
}

const frameAncestorsMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    let host = "";
    try {
      host = getRequestHost() ?? "";
    } catch {
      host = "";
    }
    if (!isDevOrPreviewHost(host)) {
      setResponseHeader(
        "Content-Security-Policy",
        "frame-ancestors https://thefrauddoctor.ca https://www.thefrauddoctor.ca",
      );
    }
    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [frameAncestorsMiddleware],
}));
