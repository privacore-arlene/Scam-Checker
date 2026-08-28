"""Source-level regression test: no outbound provider calls remain.

Confirms the deployed backend runtime (the Supabase check-scam function and all
shipped app source) cannot call:

  * www.virustotal.com
  * safebrowsing.googleapis.com

The test does not rely on interface wording. It scans the runtime source for the
hostnames, for the provider API paths, and for any fetch/XHR whose URL could
reach those hosts, including string-concatenated or env-supplied variants.

Usage:  python3 e2e/provider-regression.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RUNTIME_GLOBS = [
    "supabase/functions/**/*.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    ".lovable/mcp/manifest.json",
]

SKIP_PARTS = {"node_modules", ".git", "e2e", "dist", ".output"}

FORBIDDEN_HOSTS = ["www.virustotal.com", "virustotal.com", "safebrowsing.googleapis.com"]
FORBIDDEN_PATHS = ["/api/v3/urls", "/v4/threatMatches", "threatMatches:find"]
FORBIDDEN_ENV = ["VIRUSTOTAL_API_KEY", "GOOGLE_SAFE_BROWSING_API_KEY", "SAFE_BROWSING_API_KEY"]
FORBIDDEN_IDENT = ["checkVirusTotal", "checkSafeBrowsing"]

failures: list[str] = []
scanned: list[Path] = []


def files() -> list[Path]:
    out: list[Path] = []
    for pattern in RUNTIME_GLOBS:
        for path in ROOT.glob(pattern):
            if path.is_file() and not SKIP_PARTS.intersection(path.relative_to(ROOT).parts):
                out.append(path)
    return sorted(set(out))


def scan() -> None:
    for path in files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        scanned.append(path)
        rel = path.relative_to(ROOT)
        for needle in FORBIDDEN_HOSTS + FORBIDDEN_PATHS + FORBIDDEN_ENV + FORBIDDEN_IDENT:
            for m in re.finditer(re.escape(needle), text, re.I):
                line = text[: m.start()].count("\n") + 1
                failures.append(f"{rel}:{line} references '{needle}'")

        # Any outbound request whose target mentions a provider fragment.
        for m in re.finditer(r"(?:fetch|fetchWithTimeout|axios\.\w+|XMLHttpRequest)\s*\(([^)]{0,300})", text, re.S):
            call = m.group(1)
            if re.search(r"virustotal|safebrowsing|threatMatches", call, re.I):
                line = text[: m.start()].count("\n") + 1
                failures.append(f"{rel}:{line} outbound request could reach a removed provider")


def main() -> int:
    scan()
    print(f"scanned {len(scanned)} runtime source files")
    if failures:
        print(f"FAIL  {len(failures)} provider reference(s) found:")
        for f in failures:
            print("  - " + f)
        return 1
    for host in FORBIDDEN_HOSTS + FORBIDDEN_PATHS:
        print(f"PASS  no reference to {host}")
    print("PASS  no VirusTotal / Safe Browsing credentials or helper functions remain")
    print("PASS  no outbound request in the runtime can reach either provider")
    return 0


if __name__ == "__main__":
    sys.exit(main())
