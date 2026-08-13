import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";
import { queryClient } from "@/lib/query-client";

const SITE_URL = "https://frauddoctor-care.lovable.app";

/**
 * The Scam Checker is meant to be embedded on thefrauddoctor.ca. If someone opens
 * the published Lovable URL directly at the top level, send them to the real page
 * before any UI renders. Editor preview / dev hosts stay usable.
 */
const DIRECT_ACCESS_GUARD = `(function(){try{
  if (window.top !== window.self) return;
  var h = window.location.hostname;
  var isPreview = h.indexOf('preview--') !== -1 || h === 'localhost' || h === '127.0.0.1' || h.indexOf('-dev.lovable.app') !== -1 || h.indexOf('.lovableproject.com') !== -1;
  if (isPreview) return;
  if (h === 'frauddoctor-care.lovable.app' || h.indexOf('.lovable.app') !== -1) {
    window.location.replace('https://thefrauddoctor.ca/scam-checker');
  }
}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fraud Doctor",
  alternateName: "The Fraud Doctor",
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.png`,
  sameAs: ["https://antifraudcentre-centreantifraude.ca"],
  contactPoint: {
    "@type": "ContactPoint",
    areaServed: "CA",
    availableLanguage: ["English", "French", "Simplified Chinese", "Punjabi"],
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Fraud Doctor — Canadian Scam Detector",
  url: SITE_URL,
  description:
    "A friendly, plain-English scam checker for seniors and families in Canada. Check suspicious texts, emails, phone calls, and links.",
  inLanguage: ["en", "fr", "zh-Hans", "pa"],
  publisher: {
    "@type": "Organization",
    name: "Fraud Doctor",
    url: SITE_URL,
  },
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Fraud Doctor — Canadian Scam Detector" },
      { name: "description", content: "A friendly scam checker for seniors and families in Canada." },
      { name: "author", content: "Fraud Doctor" },
      { property: "og:title", content: "Fraud Doctor — Canadian Scam Detector" },
      { property: "og:description", content: "A friendly scam checker for seniors and families in Canada." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Fraud Doctor" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@TheFraudDoctor" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [
      // Runs in <head> before the app renders: the published app is not a
      // standalone product, it must be used embedded on thefrauddoctor.ca.
      { children: DIRECT_ACCESS_GUARD },
      { type: "application/ld+json", children: JSON.stringify(organizationSchema) },
      { type: "application/ld+json", children: JSON.stringify(websiteSchema) },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
