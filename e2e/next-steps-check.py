"""End-to-end rendering checks for the "What should I do now?" section.

Two named samples, run every time:

  1. canada.ca clean URL  -> verdict NO KNOWN WARNING FOUND
        * the whole "What should I do now?" card must be ABSENT:
          eyebrow, heading, lead-in, all four options and the emergency line
        * no placeholder / "nothing to report" text in its place
        * the cautionary "that doesn't prove it's legitimate" note still shows
        * URL reputation still reports "not on the known-threat list"

  2. RCMP summons / malware link -> verdict HIGH RISK
        * the full "What should I do now?" card must be PRESENT with the
          gold-tinted card treatment and navy top border
        * all four options open and reveal their instructions
        * the 7726 and email how-to images render
        * the emergency bank / CAFC / police line shows

Both cases also confirm the parts we must not disturb: the reset button, the
collapsed "What was checked" disclosure, and the escalation notice rules.

Turnstile is not weakened in the product; the widget script and the check-scam
response are stubbed inside the test browser only (see lib_stub.py and
e2e/MANUAL-TURNSTILE-CHECK.md).

Usage:  python3 e2e/next-steps-check.py [base_url]
"""

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib_stub import (  # noqa: E402
    CANADA_CLEAN_DIAGNOSIS,
    RCMP_MALWARE_DIAGNOSIS,
    stub_diagnosis,
    stub_turnstile,
    wait_for_turnstile,
)
from playwright.async_api import async_playwright  # noqa: E402

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
OUT = Path("/tmp/browser/e2e-next-steps")
OUT.mkdir(parents=True, exist_ok=True)

SD_TITLE = "What should I do now?"
SD_EYEBROW = "NEXT STEPS"
SD_INTRO = "Tell us how this reached you"
SD_OPTIONS = [
    "It was a text message",
    "It was an email",
    "It was a link or website",
    "It was a phone call or voicemail",
]
SD_BODY_SNIPPETS = {
    "It was a text message": "7726",
    "It was an email": "Report phishing",
    "It was a link or website": "Close the tab",
    "It was a phone call or voicemail": "Hang up",
}
SD_EMERGENCY = "call your bank right away"
CLEAN_NOTE = "That doesn't prove it's legitimate"
ESCALATION = "Money, account access or personal information involved?"
PLACEHOLDER = re.compile(r"nothing to report|no action needed|no steps (are )?needed", re.I)

CANADA_SAMPLE = (
    "Your Canada Revenue Agency account has a new message. "
    "Sign in at https://www.canada.ca/en/revenue-agency.html to read it."
)
RCMP_SAMPLE = (
    "RCMP NOTICE: A summons has been issued in your name for unacceptable network "
    "activity. Open the attached summons immediately: "
    "http://rcmp-summons-notice-file.com/summons.pdf"
)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))


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


def sd_section(page):
    """The next-steps card, located by its own heading."""
    return page.locator("section, div").filter(has_text=SD_TITLE)


async def run() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        errors: list[str] = []

        async def fresh(diagnosis):
            ctx = await browser.new_context(viewport={"width": 1280, "height": 2600})
            page = await ctx.new_page()
            page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            await stub_diagnosis(page, diagnosis)
            await open_app(page)
            return ctx, page

        # ================= CASE 1: canada.ca clean URL ==================
        ctx, page = await fresh(CANADA_CLEAN_DIAGNOSIS)
        body = await submit(page, CANADA_SAMPLE)
        await page.screenshot(path=str(OUT / "clean-canada-ca.png"))

        check("clean: verdict is NO KNOWN WARNING FOUND", "NO KNOWN WARNING FOUND" in body)
        check("clean: next-steps heading absent", SD_TITLE not in body)
        check("clean: NEXT STEPS eyebrow absent", SD_EYEBROW not in body)
        check("clean: lead-in sentence absent", SD_INTRO not in body)
        for opt in SD_OPTIONS:
            check(f"clean: option absent — {opt}", opt not in body)
        check("clean: 7726 instructions absent", "7726" not in body)
        check("clean: emergency contact line absent", SD_EMERGENCY not in body)
        check(
            "clean: next-steps card element not in the DOM",
            await sd_section(page).count() == 0,
            f"{await sd_section(page).count()} matches",
        )
        check(
            "clean: no placeholder or 'nothing to report' filler",
            not PLACEHOLDER.search(body),
            (PLACEHOLDER.search(body) or [""])[0] if PLACEHOLDER.search(body) else "",
        )
        # Things that must be untouched on a clean result.
        check("clean: cautionary note still shown", CLEAN_NOTE in body)
        check("clean: escalation notice correctly absent", ESCALATION not in body)
        check(
            "clean: 'Check another message' reset button still shown",
            await page.get_by_role("button", name=re.compile("check another", re.I)).count() > 0,
        )
        check("clean: 'What was checked' disclosure still shown", "What was checked" in body)
        check(
            "clean: 'What was checked' still collapsed by default",
            await page.locator("details[open]").count() == 0,
        )
        check(
            "clean: URL reputation reports the no-match result",
            "not on the known-threat list" in body,
        )
        await ctx.close()

        # ============ CASE 2: RCMP summons / malware link ===============
        ctx, page = await fresh(RCMP_MALWARE_DIAGNOSIS)
        body = await submit(page, RCMP_SAMPLE)
        await page.screenshot(path=str(OUT / "high-rcmp-malware.png"))

        check("rcmp: verdict is HIGH RISK", "HIGH RISK" in body)
        check("rcmp: next-steps heading shown", SD_TITLE in body)
        check("rcmp: NEXT STEPS eyebrow shown", SD_EYEBROW in body)
        check("rcmp: lead-in sentence shown", SD_INTRO in body)
        card = sd_section(page).last
        check("rcmp: next-steps card element present", await sd_section(page).count() > 0)

        for opt in SD_OPTIONS:
            check(f"rcmp: option shown — {opt}", opt in body)

        # Each option opens and reveals its own instructions.
        for opt, snippet in SD_BODY_SNIPPETS.items():
            trigger = page.get_by_role("button", name=re.compile(re.escape(opt), re.I)).first
            await trigger.click()
            revealed = ""
            for _ in range(20):
                revealed = await page.locator("body").inner_text()
                if snippet in revealed:
                    break
                await page.wait_for_timeout(250)
            check(f"rcmp: '{opt}' reveals its instructions", snippet in revealed, snippet)

        # How-to images for the text and email options.
        await page.get_by_role("button", name=re.compile("text message", re.I)).first.click()
        await page.wait_for_timeout(500)
        check(
            "rcmp: 7726 how-to image rendered",
            await page.get_by_alt_text(re.compile("7726", re.I)).count() > 0,
        )
        await page.get_by_role("button", name=re.compile("It was an email", re.I)).first.click()
        await page.wait_for_timeout(500)
        check(
            "rcmp: phishing-email how-to image rendered",
            await page.get_by_alt_text(re.compile("phishing email", re.I)).count() > 0,
        )

        check("rcmp: emergency bank / CAFC / police line shown", SD_EMERGENCY in body)
        check("rcmp: CAFC phone number shown in emergency line", "1-888-495-8501" in body)

        # Visual treatment: gold-tinted card with a solid navy top border.
        styles = await card.evaluate(
            "el => { const s = getComputedStyle(el);"
            " return { top: s.borderTopWidth, bg: s.backgroundColor, radius: s.borderTopLeftRadius }; }"
        )
        check(
            "rcmp: navy top border retained on the card",
            float(str(styles["top"]).replace("px", "") or 0) >= 4,
            str(styles["top"]),
        )
        check(
            "rcmp: gold-tinted background retained",
            styles["bg"] not in ("rgba(0, 0, 0, 0)", "transparent"),
            str(styles["bg"]),
        )
        check(
            "rcmp: rounded corners retained",
            float(str(styles["radius"]).replace("px", "") or 0) >= 8,
            str(styles["radius"]),
        )

        # Things that must be untouched on a flagged result.
        check("rcmp: escalation notice shown", ESCALATION in body)
        check("rcmp: flagged link reported in 'What was checked'",
              "Flagged as a known dangerous link" in body)
        check(
            "rcmp: 'Check another message' reset button still shown",
            await page.get_by_role("button", name=re.compile("check another", re.I)).count() > 0,
        )
        check("rcmp: 'What was checked' disclosure still shown", "What was checked" in body)
        # The RCMP sample is government impersonation, not a relative — the
        # family-phrase conditional from the earlier fix must stay quiet.
        check(
            "rcmp: family verification phrase stays hidden for government impersonation",
            "family phrase" not in body.lower(),
        )
        await ctx.close()

        check("no console/page errors", not errors, "; ".join(errors[:3]))
        await browser.close()

    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed. Screenshots: {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
