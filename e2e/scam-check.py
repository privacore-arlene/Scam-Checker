"""End-to-end check for Fraud Doctor — Scam Detector (text-only build).

Covers the current wording-analysis product:
  * beta badge, privacy notice and screenshot-disabled notice
  * no screenshot file input; pasting an image attaches nothing
  * consent checkbox is required and gates the Check button
  * diagnosis card for HIGH RISK / BE CAREFUL / NO KNOWN WARNING FOUND
  * "What was checked" inventory wording
  * escalation notice on HIGH RISK and BE CAREFUL
  * "Few warning signs detected" instead of "Danger: Low"
  * no VirusTotal / Malwarebytes / Google Safe Browsing wording anywhere
  * Recent Scams in Canada section

Turnstile is never bypassed in production. The headless run stubs the Turnstile
browser script and the check-scam response inside the test browser only; the
real-token submission is a manual post-deployment check (see
e2e/MANUAL-TURNSTILE-CHECK.md).

Usage:  python3 e2e/scam-check.py [base_url]
"""

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib_stub import (  # noqa: E402
    CAREFUL_DIAGNOSIS,
    HIGH_DIAGNOSIS,
    LOW_DIAGNOSIS,
    stub_diagnosis,
    stub_turnstile,
    wait_for_turnstile,
)
from playwright.async_api import async_playwright  # noqa: E402

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
OUT = Path("/tmp/browser/e2e")
OUT.mkdir(parents=True, exist_ok=True)

BADGE = "Free beta • Educational screening • Made for Canadians"
CONSENT = "I understand this is an automated educational screening"
SCREENSHOT_NOTICE = "Screenshot checking is temporarily unavailable"
ESCALATION = "Money, account access or personal information involved?"
FORBIDDEN = re.compile(r"virustotal|malwarebytes|safe browsing|danger:\s*low", re.I)

SAMPLE_WITH_URL = (
    "CRA FINAL NOTICE: You owe $4,182 in back taxes. A warrant has been issued. "
    "Call 1-604-555-0199 and pay by e-transfer to avoid arrest. "
    "http://cra-refund-secure-verify.com"
)
SAMPLE_NO_URL = "Hi Grandma, dinner is at 6 tomorrow. Love, Sarah."

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))


def make_image(path: Path) -> None:
    from PIL import Image

    Image.new("RGB", (240, 120), "white").save(path)


async def open_app(page) -> None:
    await stub_turnstile(page)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.locator("textarea").first.wait_for(timeout=20_000)
    await wait_for_turnstile(page)


async def submit(page, message: str) -> str:
    await page.locator("textarea").first.fill(message)
    await page.get_by_role("checkbox").first.check()
    btn = page.get_by_role("button", name=re.compile("check this message", re.I)).first
    for _ in range(30):
        if not await btn.is_disabled():
            break
        await page.wait_for_timeout(500)
    await btn.click()
    body = ""
    for _ in range(60):
        body = await page.locator("body").inner_text()
        if re.search(r"what was checked", body, re.I):
            break
        await page.wait_for_timeout(500)
    return body


async def run() -> int:
    img = OUT / "pasted-image.png"
    make_image(img)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        errors: list[str] = []

        async def fresh(diagnosis=None):
            ctx = await browser.new_context(viewport={"width": 1280, "height": 2600})
            page = await ctx.new_page()
            page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            if diagnosis is not None:
                await stub_diagnosis(page, diagnosis)
            await open_app(page)
            return ctx, page

        # ---------- 1. Landing state -------------------------------------
        ctx, page = await fresh()
        heading = (await page.locator("h1").first.inner_text()).strip()
        check("app loads with Fraud Doctor header", "Fraud Doctor" in heading, heading)
        body = await page.locator("body").inner_text()
        check("beta badge wording is current", BADGE in body)
        check("privacy notice above the input", "Before submitting: Remove passwords" in body)
        check("screenshot-disabled notice shown", SCREENSHOT_NOTICE in body)
        check("consent checkbox rendered", CONSENT in body)
        check("no provider or 'Danger: Low' wording on landing", not FORBIDDEN.search(body),
              (FORBIDDEN.search(body) or [""])[0] if FORBIDDEN.search(body) else "")

        # ---------- 2. Screenshot upload removed -------------------------
        check("no screenshot file input rendered", await page.locator("input[type=file]").count() == 0)
        check("no 'Add screenshot' control rendered",
              await page.get_by_text(re.compile(r"add screenshot", re.I)).count() == 0)

        # pasting an image must not attach or submit anything
        await page.locator("textarea").first.click()
        await page.evaluate(
            """() => {
              const dt = new DataTransfer();
              dt.items.add(new File([new Uint8Array([137,80,78,71])], 'x.png', {type:'image/png'}));
              document.querySelector('textarea').dispatchEvent(
                new ClipboardEvent('paste', {clipboardData: dt, bubbles: true}));
            }"""
        )
        await page.wait_for_timeout(1_000)
        after_paste = await page.locator("body").inner_text()
        check("pasted image does not attach a screenshot",
              await page.get_by_alt_text("Screenshot to check").count() == 0
              and "Screenshot attached" not in after_paste)
        check("pasted image does not submit a check", not re.search(r"what was checked", after_paste, re.I))

        # ---------- 3. Consent + Turnstile gate the button ---------------
        btn = page.get_by_role("button", name=re.compile("check this message", re.I)).first
        await page.locator("textarea").first.fill(SAMPLE_NO_URL)
        await page.wait_for_timeout(300)
        check("button disabled with text but no consent", await btn.is_disabled())
        await page.get_by_role("checkbox").first.check()
        await page.wait_for_timeout(500)
        check("button enabled once consent ticked and Turnstile resolved", not await btn.is_disabled())
        await page.get_by_role("checkbox").first.uncheck()
        await page.wait_for_timeout(300)
        check("button disabled again when consent removed", await btn.is_disabled())
        await page.screenshot(path=str(OUT / "landing.png"))
        await ctx.close()

        # ---------- 4. HIGH RISK result ---------------------------------
        ctx, page = await fresh(HIGH_DIAGNOSIS)
        body = await submit(page, SAMPLE_WITH_URL)
        await page.screenshot(path=str(OUT / "result-high.png"))
        check("HIGH RISK verdict shown", "HIGH RISK" in body)
        check("HIGH RISK shows escalation notice", ESCALATION in body)
        check("STOP / VERIFY / CALL steps shown", all(w in body for w in ("STOP", "VERIFY", "CALL")))
        check("'What was checked' section shown", "What was checked" in body)
        check("message warning signs: Checked", re.search(r"Message warning signs\s*\n?\s*Checked", body) is not None)
        check("URL reputation: Temporarily unavailable", "Temporarily unavailable" in body)
        check("sender identity: Not verified",
              re.search(r"Sender identity\s*\n?\s*Not verified", body) is not None)
        check("phone or email ownership: Not verified",
              re.search(r"Phone or email ownership\s*\n?\s*Not verified", body) is not None)
        check("website legitimacy: Not proven",
              re.search(r"Website legitimacy\s*\n?\s*Not proven", body) is not None)
        check("attachments: Not checked",
              re.search(r"Attachments\s*\n?\s*Not checked", body) is not None)
        check("link reputation notice says coming soon", "Commercial link reputation check coming soon" in body)
        check("no provider wording in HIGH result", not FORBIDDEN.search(body))
        check("report link points to Anti-Fraud Centre",
              await page.locator("a[href*='antifraudcentre-centreantifraude.ca']").count() > 0)
        check("educational disclaimer shown", bool(re.search(r"educational", body, re.I)))
        await ctx.close()

        # ---------- 5. BE CAREFUL result --------------------------------
        ctx, page = await fresh(CAREFUL_DIAGNOSIS)
        body = await submit(page, SAMPLE_WITH_URL)
        check("BE CAREFUL verdict shown", "BE CAREFUL" in body)
        check("BE CAREFUL shows escalation notice", ESCALATION in body)
        await ctx.close()

        # ---------- 6. NO KNOWN WARNING FOUND result --------------------
        ctx, page = await fresh(LOW_DIAGNOSIS)
        body = await submit(page, SAMPLE_NO_URL)
        await page.screenshot(path=str(OUT / "result-low.png"))
        check("NO KNOWN WARNING FOUND verdict shown", "NO KNOWN WARNING FOUND" in body)
        check("'Few warning signs detected' replaces 'Danger: Low'",
              "Few warning signs detected" in body and not re.search(r"danger:\s*low", body, re.I))
        check("URL reputation: No URL supplied", "No URL supplied" in body)
        # Only favourable *claims* are forbidden; the disclaimers deliberately use
        # the words "legitimate" and "safety" in a negated, cautionary form.
        claims = re.compile(
            r"(this (message|sender|website|link) is (safe|legitimate|genuine|real|verified)"
            r"|appears (safe|legitimate|genuine)"
            r"|sender (is|was) verified"
            r"|danger:\s*low)", re.I)
        check("low-risk result never claims safe/legitimate/verified sender",
              not claims.search(body), (claims.search(body) or [""])[0] if claims.search(body) else "")
        check("no provider wording in low-risk result", not FORBIDDEN.search(body))

        # ---------- 7. Recent Scams -------------------------------------
        page_text = await page.locator("body").inner_text()
        check("Recent Scams heading shown", bool(re.search(r"recent scams", page_text, re.I)))
        cards = await page.locator("section:has-text('Recent Scams') article").count()
        check("Recent Scams cards rendered", cards >= 3, f"{cards} cards")
        await ctx.close()

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        await browser.close()

    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed. Screenshots: {OUT}")
    print("MANUAL: real Turnstile token submission must be verified once by a human "
          "after deployment — see e2e/MANUAL-TURNSTILE-CHECK.md")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
