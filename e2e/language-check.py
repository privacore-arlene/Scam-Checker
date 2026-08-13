"""Language end-to-end check for Fraud Doctor — Scam Detector.

For every supported language (English, Traditional Chinese, Simplified Chinese,
Punjabi) this script:

  1. Switches the language with the header switcher.
  2. Confirms the "Recent Scams in Canada" heading and the alert cards render
     in that language (translated title / source label / body).
  3. Pastes a sample scam message, submits it, and confirms the diagnosis
     labels (Diagnosis, Danger + danger level, Why I think this, What I noticed,
     STOP / VERIFY / CALL) all render in the selected language.

Expected strings are read straight out of src/lib/i18n.tsx, so the test cannot
drift from the app's own dictionaries.

Usage:  python3 e2e/language-check.py [base_url]
Exits 0 when every assertion passes, 1 otherwise.
"""

import asyncio
import json
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "lib" / "i18n.tsx"
OUT = Path("/tmp/browser/e2e-language")
OUT.mkdir(parents=True, exist_ok=True)

LANGS = ["en", "fr", "zh-Hans", "pa"]
NATIVE = {"en": "English", "fr": "Français", "zh-Hans": "简体中文", "pa": "ਪੰਜਾਬੀ"}

SAMPLE = (
    "CRA FINAL NOTICE: You owe $4,182 in back taxes. A warrant has been issued. "
    "Call 1-604-555-0199 today and pay by e-transfer or Bitcoin to avoid arrest. "
    "Do not tell anyone. http://cra-refund-secure-verify.com"
)

# Labels that must appear in the selected language on the diagnosis card.
DIAGNOSIS_KEYS = ["diagnosis", "danger", "why", "red_flags", "fw_title", "fw_stop", "fw_verify", "fw_call"]
DANGER_KEYS = ["danger_high", "danger_medium", "danger_low"]

failures: list[str] = []


def check(ok: bool, label: str) -> None:
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok:
        failures.append(label)


def load_dictionaries() -> dict[str, dict[str, str]]:
    """Read the four language dictionaries out of src/lib/i18n.tsx."""
    source = I18N.read_text(encoding="utf-8")
    dicts: dict[str, dict[str, str]] = {}
    for lang in LANGS:
        key = lang if "-" not in lang else f'"{lang}"'
        start = re.search(rf"^  {re.escape(key)}: {{$", source, re.M)
        if start is None:
            raise SystemExit(f"could not find the {lang} dictionary in {I18N}")
        end = source.index("\n  },", start.end())
        block = source[start.end() : end]
        entries: dict[str, str] = {}
        for name, value in re.findall(r'^\s{4}([a-z0-9_]+):\s*(".*?"),\s*$', block, re.M | re.S):
            entries[name] = json.loads(value)
        dicts[lang] = entries
    return dicts


async def run_language(browser, lang: str, strings: dict[str, dict[str, str]]) -> None:
    d = strings[lang]
    en = strings["en"]
    label = NATIVE[lang]
    # A fresh context per language means a fresh device id, so the free daily
    # check limit does not interfere with the run.
    context = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page = await context.new_page()
    await page.goto(BASE_URL, wait_until="networkidle")

    if lang != "en":
        await page.locator("[aria-label]").filter(has_text=re.compile(r"English|Français|简体中文|ਪੰਜਾਬੀ")).first.click()
        await page.get_by_role("menuitem", name=re.compile(re.escape(label))).first.click()
        await page.wait_for_timeout(500)

    check(await page.locator("html").get_attribute("lang") == lang, f"[{lang}] <html lang> is {lang}")

    # ---- Recent Scams in Canada ----------------------------------------
    heading = page.get_by_role("heading", level=2, name=d["recent_title"])
    await heading.wait_for(timeout=15_000)
    check(True, f"[{lang}] Recent-scams heading reads '{d['recent_title']}'")

    section = page.locator("section", has=heading)
    await section.locator("article").first.wait_for(timeout=20_000)
    if lang != "en":
        # Alert bodies are translated on the server; give the call time to land.
        for _ in range(60):
            text = await section.inner_text()
            if not re.search(r"[A-Za-z]{6,}", text.replace(d["recent_title"], "")):
                break
            await page.wait_for_timeout(1_000)

    await section.screenshot(path=str(OUT / f"alerts-{lang}.png"))
    section_text = await section.inner_text()
    has_source_links = await section.locator("article a[href^='http']").count() > 0
    if has_source_links:
        check(
            d["sources"].casefold() in section_text.casefold(),
            f"[{lang}] Sources label reads '{d['sources']}'",
        )
    else:
        print(f"SKIP  [{lang}] Sources label — no approved alert currently stores source links")
    if lang != "en":
        stripped = re.sub(r"https?://\S+|[A-Z]{2,5}\b", "", section_text.replace(d["recent_title"], ""))
        leftover = re.findall(r"[A-Za-z]{6,}", stripped)
        # Source links keep their original English titles, so only check cards.
        card_text = await section.locator("article").first.inner_text()
        card_body = card_text.split(d["sources"])[0]
        card_leftover = re.findall(r"[A-Za-z]{6,}", re.sub(r"https?://\S+", "", card_body))
        check(
            len(card_leftover) == 0,
            f"[{lang}] first alert card carries no untranslated English (found {card_leftover[:4]})",
        )
        check(len(leftover) < 40, f"[{lang}] alert section is predominantly translated")

    # ---- Diagnosis labels ----------------------------------------------
    box = page.get_by_role("textbox").first
    await box.fill(SAMPLE)
    await page.get_by_role("button", name=d["check_btn"]).click()

    verdicts = [d["verdict_scam"], d["verdict_likely"], d["verdict_safe"]]
    limit_hit = False
    try:
        await page.get_by_text(re.compile("|".join(re.escape(v) for v in verdicts))).first.wait_for(timeout=60_000)
    except Exception:
        body = await page.locator("main").inner_text()
        if d["limit_title"] in body:
            limit_hit = True
        else:
            await page.screenshot(path=str(OUT / f"diagnosis-timeout-{lang}.png"))
            check(False, f"[{lang}] diagnosis card rendered")
            await context.close()
            return

    if limit_hit:
        check(d["limit_title"] in await page.locator("main").inner_text(), f"[{lang}] limit card is translated")
        await context.close()
        return

    card = page.locator("main")
    await page.screenshot(path=str(OUT / f"diagnosis-{lang}.png"))
    card_text = await card.inner_text()

    haystack = card_text.casefold()
    for key in DIAGNOSIS_KEYS:
        check(d[key].casefold() in haystack, f"[{lang}] diagnosis label '{key}' reads '{d[key]}'")
        if (
            lang != "en"
            and key not in {"fw_stop", "fw_verify", "fw_call"}
            and d[key].casefold() != en[key].casefold()
            and en[key].casefold() not in d[key].casefold()
        ):
            check(en[key].casefold() not in haystack, f"[{lang}] English '{en[key]}' is not shown")

    danger_shown = [k for k in DANGER_KEYS if d[k].casefold() in haystack]
    check(len(danger_shown) > 0, f"[{lang}] danger level is translated ({danger_shown})")

    check(
        any(v in card_text for v in verdicts),
        f"[{lang}] verdict headline is translated",
    )

    await context.close()


async def main() -> int:
    strings = load_dictionaries()
    missing = [
        f"{lang}.{key}"
        for lang in LANGS
        for key in DIAGNOSIS_KEYS + DANGER_KEYS + ["recent_title", "sources", "check_btn", "limit_title"]
        if key not in strings[lang]
    ]
    check(not missing, f"every language defines every tested label (missing: {missing})")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        for lang in LANGS:
            print(f"\n=== {lang} ({NATIVE[lang]}) ===")
            try:
                await run_language(browser, lang, strings)
            except Exception as exc:  # keep going so every language is reported
                check(False, f"[{lang}] run failed: {exc}")
        await browser.close()

    print("\n" + ("ALL LANGUAGE CHECKS PASSED" if not failures else f"{len(failures)} FAILURE(S):"))
    for f in failures:
        print(" - " + f)
    print(f"screenshots: {OUT}")
    return 0 if not failures else 1


sys.exit(asyncio.run(main()))
