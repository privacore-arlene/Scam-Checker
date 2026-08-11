"""End-to-end check for Fraud Doctor — Scam Detector.

Opens the app, runs a sample scan, and confirms the diagnosis card and the
"Recent Scams in Canada" section render.

Usage:  python3 e2e/scam-check.py [base_url]
Exits 0 when every assertion passes, 1 otherwise.
"""

import asyncio
import re
import sys

from playwright.async_api import async_playwright

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
SHOT = "/tmp/browser/e2e/scam-check.png"

SAMPLE = (
    "CRA FINAL NOTICE: You owe $4,182 in back taxes. A warrant has been issued. "
    "Call 1-604-555-0199 immediately and pay by Bitcoin or e-transfer to avoid arrest. "
    "Do not tell anyone. http://cra-refund-secure-verify.com"
)

VERDICT = re.compile(r"(this is a scam|likely scam|looks safe)", re.I)


async def run() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors: list[str] = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))

        # 1. App loads
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        heading = (await page.locator("h1").first.inner_text()).strip()
        check("app loads with Fraud Doctor header", "Fraud Doctor" in heading, heading)

        # 2. Run a sample scan
        box = page.locator("textarea").first
        await box.wait_for(timeout=20000)
        await box.fill(SAMPLE)
        await page.get_by_role(
            "button", name=re.compile("check this message", re.I)
        ).first.click()

        verdict = None
        for _ in range(75):
            body = await page.locator("body").inner_text()
            match = VERDICT.search(body)
            if match and re.search(r"what to do now", body, re.I):
                verdict = match.group(1)
                break
            await page.wait_for_timeout(1000)
        body = await page.locator("body").inner_text()
        await page.screenshot(path=SHOT)

        # 3. Diagnosis card contents
        check("verdict shown", verdict is not None, verdict or "no verdict within 75s")
        check("danger level shown", bool(re.search(r"danger", body, re.I)))
        check("scam type shown", bool(re.search(r"scam", body, re.I)))
        check("explanation shown", bool(re.search(r"why i think this", body, re.I)))
        check(
            "STOP / VERIFY / CALL steps shown",
            all(w in body for w in ("STOP", "VERIFY", "CALL")),
        )
        check("what to do now shown", bool(re.search(r"what to do now", body, re.I)))
        check(
            "report link points to Anti-Fraud Centre",
            await page.locator("a[href*='antifraudcentre-centreantifraude.ca']").count() > 0,
        )
        check("educational disclaimer shown", bool(re.search(r"educational", body, re.I)))

        # 4. Recent Scams section
        check("Recent Scams heading shown", bool(re.search(r"recent scams", body, re.I)))
        cards = await page.locator(
            "section:has-text('Recent Scams') [class*='rounded']"
        ).count()
        check("Recent Scams cards rendered", cards >= 3, f"{cards} card elements")

        # 5. No runtime errors
        check("no console/page errors", not errors, "; ".join(errors[:3]))

        await browser.close()

    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed. Screenshot: {SHOT}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
