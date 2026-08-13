import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

/**
 * Allow only the official website to embed the Scam Checker.
 * frame-ancestors is used (never X-Frame-Options) so thefrauddoctor.ca can embed it.
 */
const frameAncestorsMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    setResponseHeader(
      "Content-Security-Policy",
      "frame-ancestors https://thefrauddoctor.ca https://www.thefrauddoctor.ca",
    );
    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [frameAncestorsMiddleware],
}));
