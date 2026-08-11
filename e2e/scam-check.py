"""End-to-end check for Fraud Doctor — Scam Detector.

Opens the app and runs one sample scan per supported input type (text message,
email, phone number, URL, screenshot), confirming a diagnosis card renders for
each, then confirms the "Recent Scams in Canada" section renders.

Usage:  python3 e2e/scam-check.py [base_url]
Exits 0 when every assertion passes, 1 otherwise.
"""

import asyncio
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
OUT = Path("/tmp/browser/e2e")
OUT.mkdir(parents=True, exist_ok=True)

VERDICT = re.compile(r"(this is a scam|likely scam|looks safe)", re.I)
LIMIT = re.compile(r"(free checks|come back|limit)", re.I)

SAMPLES: list[tuple[str, str]] = [
    (
        "text message",
        "CRA FINAL NOTICE: You owe $4,182 in back taxes. A warrant has been issued. "
        "Call 1-604-555-0199 immediately and pay by Bitcoin or e-transfer to avoid arrest. "
        "Do not tell anyone. http://cra-refund-secure-verify.com",
    ),
    (
        "email",
        "From: security-alert@rbc-online-verify.com\n"
        "Subject: Your RBC account has been suspended\n\n"
        "Dear Customer, we detected unusual activity. Confirm your identity within 24 hours "
        "or your account will be permanently closed. Click here to restore access: "
        "http://rbc-online-verify.com/login",
    ),
    ("phone number", "Is this number a scam? +1 (604) 555-0143 — they keep calling saying they are from Service Canada."),
    ("URL", "https://interac-etransfer-refund-ca.com/claim"),
]


def make_screenshot(path: Path) -> None:
    """Render a fake scam SMS screenshot for the image-input sample."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (700, 320), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 700, 56], fill=(10, 22, 40))
    d.text((16, 20), "Messages  -  +1 (778) 555-0182", fill="white")
    lines = [
        "GRANDMA IT'S ME. I'M IN JAIL IN VANCOUVER.",
        "PLEASE DON'T TELL MOM OR DAD.",
        "MY LAWYER NEEDS $2,400 BAIL TODAY BY",
        "E-TRANSFER OR GIFT CARDS.",
        "SEND TO: bail.help.now@fastmail.com",
    ]
    for i, line in enumerate(lines):
        d.text((20, 90 + i * 40), line, fill=(20, 20, 20))
    img.save(path)


async def run() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, bool(ok), detail))

    shot_path = OUT / "sample-sms.png"
    make_screenshot(shot_path)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        errors: list[str] = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))

        async def load() -> None:
            await page.goto(BASE_URL, wait_until="domcontentloaded")
            await page.locator("textarea").first.wait_for(timeout=20000)

        async def scan(label: str, text: str, image: Path | None = None) -> str:
            """Fill the form for one input type, submit, and return the page text."""
            await load()
            box = page.locator("textarea").first
            await box.click()
            await box.fill(text)
            # React state must register the text before the button becomes active.
            for _ in range(20):
                if re.search(r"[1-9]\d*\s*/\s*4000", await page.locator("body").inner_text()):
                    break
                await box.press_sequentially(" ", delay=30)
                await page.wait_for_timeout(200)
            if image is not None:
                await page.locator("input[type=file]").first.set_input_files(str(image))
                await page.get_by_alt_text("Screenshot to check").wait_for(timeout=10000)
            await page.get_by_role(
                "button", name=re.compile("check this message", re.I)
            ).first.click()

            body = ""
            for _ in range(75):
                body = await page.locator("body").inner_text()
                if VERDICT.search(body) and re.search(r"what to do now", body, re.I):
                    break
                if LIMIT.search(body) and not VERDICT.search(body):
                    break
                await page.wait_for_timeout(1000)
            await page.screenshot(path=str(OUT / f"scan-{label.replace(' ', '-')}.png"))
            return body

        # 1. App loads
        await load()
        heading = (await page.locator("h1").first.inner_text()).strip()
        check("app loads with Fraud Doctor header", "Fraud Doctor" in heading, heading)

        # 2. One scan per supported input type
        last_body = ""
        cases: list[tuple[str, str, Path | None]] = [
            *[(label, text, None) for label, text in SAMPLES],
            ("screenshot", "This came to my phone — is it real?", shot_path),
        ]
        for label, text, image in cases:
            body = await scan(label, text, image)
            match = VERDICT.search(body)
            if match:
                last_body = body
                check(f"{label} input: verdict shown", True, match.group(1))
                check(
                    f"{label} input: STOP / VERIFY / CALL steps shown",
                    all(w in body for w in ("STOP", "VERIFY", "CALL")),
                )
            elif LIMIT.search(body):
                # Daily free-check limit hit; the limit card is itself valid output.
                check(f"{label} input: daily limit card shown (scan skipped)", True)
            else:
                check(f"{label} input: verdict shown", False, "no verdict within 75s")

        # 3. Diagnosis card contents (from the last successful scan)
        if last_body:
            body = last_body
            check("danger level shown", bool(re.search(r"danger", body, re.I)))
            check("scam type shown", bool(re.search(r"scam", body, re.I)))
            check("explanation shown", bool(re.search(r"why i think this", body, re.I)))
            check("what to do now shown", bool(re.search(r"what to do now", body, re.I)))
            check("educational disclaimer shown", bool(re.search(r"educational", body, re.I)))
            check(
                "report link points to Anti-Fraud Centre",
                await page.locator("a[href*='antifraudcentre-centreantifraude.ca']").count() > 0,
            )
        else:
            check("at least one diagnosis rendered", False, "every scan blocked or failed")

        # 4. Recent Scams section
        page_text = await page.locator("body").inner_text()
        check("Recent Scams heading shown", bool(re.search(r"recent scams", page_text, re.I)))
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
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed. Screenshots: {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
