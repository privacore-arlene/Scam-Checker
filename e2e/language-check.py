"""Language end-to-end check for Fraud Doctor — Scam Detector (text-only build).

For every supported language (English, French, Simplified Chinese, Punjabi):

  1. Every tested translation key exists in all four dictionaries (parity).
  2. The language switcher sets <html lang> and translates the input-side
     wording: beta badge, privacy notice, screenshot-disabled notice and the
     consent checkbox.
  3. "Recent Scams in Canada" heading and alert cards render translated.
  4. A diagnosis card renders with translated labels, including the
     "What was checked" inventory, the escalation notice, and
     "Few warning signs detected" for a low-risk result.

Expected strings are read straight out of src/lib/i18n.tsx, so the test cannot
drift from the app's own dictionaries.

Turnstile is never bypassed in production: the Turnstile browser script and the
check-scam response are stubbed inside the test browser only. The real-token
submission is a manual post-deployment check (e2e/MANUAL-TURNSTILE-CHECK.md).

Usage:  python3 e2e/language-check.py [base_url]
"""

import asyncio
import json
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
ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "lib" / "i18n.tsx"
OUT = Path("/tmp/browser/e2e-language")
OUT.mkdir(parents=True, exist_ok=True)

LANGS = ["en", "fr", "zh-Hans", "pa"]
NATIVE = {"en": "English", "fr": "Français", "zh-Hans": "简体中文", "pa": "ਪੰਜਾਬੀ"}

SAMPLE = (
    "CRA FINAL NOTICE: You owe $4,182 in back taxes. A warrant has been issued. "
    "Call 1-604-555-0199 today and pay by e-transfer to avoid arrest. "
    "http://cra-refund-secure-verify.com"
)
SAMPLE_NO_URL = "Hi Grandma, dinner is at 6 tomorrow. Love, Sarah."

# Labels that must appear in the selected language on the diagnosis card.
DIAGNOSIS_KEYS = ["diagnosis", "danger", "why", "red_flags", "fw_title", "fw_stop", "fw_verify", "fw_call"]
WHAT_CHECKED_KEYS = [
    "wc_title", "wc_signs", "wc_url", "wc_sender", "wc_phone", "wc_site",
    "wc_attachments", "wc_checked", "wc_no_url", "wc_unavailable",
    "wc_not_verified", "wc_not_proven", "wc_not_checked",
]
INPUT_KEYS = ["hero_badge", "privacy_notice", "screenshot_unavailable", "consent_label", "consent_required"]
PARITY_KEYS = (
    DIAGNOSIS_KEYS + WHAT_CHECKED_KEYS + INPUT_KEYS
    + ["danger_high", "danger_medium", "danger_few", "escalate", "link_soon",
       "recent_title", "sources", "check_btn", "limit_title",
       "verdict_high", "verdict_careful", "verdict_none"]
)

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


async def switch_language(page, lang: str) -> None:
    if lang == "en":
        return
    await page.locator("[aria-label]").filter(
        has_text=re.compile(r"English|Français|简体中文|ਪੰਜਾਬੀ")
    ).first.click()
    await page.get_by_role("menuitem", name=re.compile(re.escape(NATIVE[lang]))).first.click()
    await page.wait_for_timeout(500)


async def submit(page, d: dict[str, str], message: str) -> str:
    await page.locator("textarea").first.fill(message)
    await page.get_by_role("checkbox").first.check()
    btn = page.get_by_role("button", name=re.compile(re.escape(d["check_btn"]))).first
    for _ in range(30):
        if not await btn.is_disabled():
            break
        await page.wait_for_timeout(500)
    await btn.click()
    body = ""
    for _ in range(60):
        body = await page.locator("main").inner_text()
        if d["wc_title"] in body:
            break
        await page.wait_for_timeout(500)
    return body


async def run_language(browser, lang: str, strings: dict[str, dict[str, str]]) -> None:
    d = strings[lang]
    en = strings["en"]
    # A fresh context per language means a fresh device id, so the free daily
    # check limit does not interfere with the run.
    context = await browser.new_context(viewport={"width": 1280, "height": 2600})
    page = await context.new_page()
    await stub_turnstile(page)
    await stub_diagnosis(page, HIGH_DIAGNOSIS)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.locator("textarea").first.wait_for(timeout=20_000)
    await wait_for_turnstile(page)
    await switch_language(page, lang)

    check(await page.locator("html").get_attribute("lang") == lang, f"[{lang}] <html lang> is {lang}")

    # ---- Input-side wording -------------------------------------------
    landing = await page.locator("body").inner_text()
    for key in INPUT_KEYS:
        if key == "consent_required":
            continue
        check(d[key] in landing, f"[{lang}] '{key}' is shown in this language")
    check(await page.locator("input[type=file]").count() == 0, f"[{lang}] no screenshot file input is rendered")

    # ---- Recent Scams in Canada ---------------------------------------
    heading = page.get_by_role("heading", level=2, name=d["recent_title"])
    await heading.wait_for(timeout=15_000)
    check(True, f"[{lang}] Recent-scams heading reads '{d['recent_title']}'")

    section = page.locator("section", has=heading)
    await section.locator("article").first.wait_for(timeout=20_000)
    latin_script = lang in {"en", "fr"}
    if not latin_script:
        # Alert bodies are translated on the server; give the call time to land.
        for _ in range(60):
            text = await section.inner_text()
            if not re.search(r"[A-Za-z]{6,}", text.replace(d["recent_title"], "")):
                break
            await page.wait_for_timeout(1_000)
    elif lang == "fr":
        for _ in range(60):
            text = await section.inner_text()
            if re.search(r"\b(le|la|les|une|vous|arnaque|fraude|courriel)\b", text, re.I):
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
    if lang == "fr":
        markers = re.findall(r"\b(le|la|les|une|vous|arnaque|fraude|courriel|faux|téléphone)\b", section_text, re.I)
        check(len(markers) >= 3, f"[{lang}] alert cards are in French (markers found: {len(markers)})")
    elif lang != "en":
        stripped = re.sub(r"https?://\S+|[A-Z]{2,5}\b", "", section_text.replace(d["recent_title"], ""))
        leftover = re.findall(r"[A-Za-z]{6,}", stripped)
        card_text = await section.locator("article").first.inner_text()
        card_body = card_text.split(d["sources"])[0]
        card_leftover = re.findall(r"[A-Za-z]{6,}", re.sub(r"https?://\S+", "", card_body))
        check(
            len(card_leftover) == 0,
            f"[{lang}] first alert card carries no untranslated English (found {card_leftover[:4]})",
        )
        check(len(leftover) < 40, f"[{lang}] alert section is predominantly translated")

    # ---- HIGH RISK diagnosis labels ------------------------------------
    card_text = await submit(page, d, SAMPLE)
    await page.screenshot(path=str(OUT / f"diagnosis-{lang}.png"))
    haystack = card_text.casefold()

    for key in DIAGNOSIS_KEYS + WHAT_CHECKED_KEYS:
        if key in {"wc_no_url", "wc_checked", "wc_unavailable"} and key == "wc_no_url":
            continue  # a URL was supplied in this sample
        check(d[key].casefold() in haystack, f"[{lang}] label '{key}' reads '{d[key]}'")
        if (
            lang != "en"
            and key not in {"fw_stop", "fw_verify", "fw_call"}
            and d[key].casefold() != en[key].casefold()
            and en[key].casefold() not in d[key].casefold()
        ):
            check(en[key].casefold() not in haystack, f"[{lang}] English '{en[key]}' is not shown")

    check(d["danger_high"].casefold() in haystack, f"[{lang}] danger level is translated")
    check(d["verdict_high"] in card_text, f"[{lang}] verdict headline is translated")
    check(d["escalate"] in card_text, f"[{lang}] HIGH RISK shows the translated escalation notice")
    check(d["link_soon"].casefold() in haystack or d["wc_unavailable"].casefold() in haystack,
          f"[{lang}] link reputation is reported as unavailable, never as checked by a provider")
    check(not re.search(r"virustotal|malwarebytes|safe browsing", card_text, re.I),
          f"[{lang}] no removed provider is named")
    await context.close()

    # ---- BE CAREFUL escalation ----------------------------------------
    context = await browser.new_context(viewport={"width": 1280, "height": 2600})
    page = await context.new_page()
    await stub_turnstile(page)
    await stub_diagnosis(page, CAREFUL_DIAGNOSIS)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.locator("textarea").first.wait_for(timeout=20_000)
    await wait_for_turnstile(page)
    await switch_language(page, lang)
    careful = await submit(page, d, SAMPLE)
    check(d["verdict_careful"] in careful, f"[{lang}] BE CAREFUL verdict is translated")
    check(d["escalate"] in careful, f"[{lang}] BE CAREFUL shows the translated escalation notice")
    await context.close()

    # ---- Low-risk wording ---------------------------------------------
    context = await browser.new_context(viewport={"width": 1280, "height": 2600})
    page = await context.new_page()
    await stub_turnstile(page)
    await stub_diagnosis(page, LOW_DIAGNOSIS)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.locator("textarea").first.wait_for(timeout=20_000)
    await wait_for_turnstile(page)
    await switch_language(page, lang)
    low = await submit(page, d, SAMPLE_NO_URL)
    check(d["verdict_none"] in low, f"[{lang}] NO KNOWN WARNING FOUND verdict is translated")
    check(d["danger_few"] in low, f"[{lang}] low risk reads '{d['danger_few']}' (no 'Danger: Low')")
    check(f"{d['danger']}: {d.get('danger_low', '§')}" not in low, f"[{lang}] old 'Danger: Low' wording is gone")
    check(d["wc_no_url"] in low, f"[{lang}] URL reputation reads '{d['wc_no_url']}'")
    await page.screenshot(path=str(OUT / f"diagnosis-low-{lang}.png"))
    await context.close()


async def main() -> int:
    strings = load_dictionaries()
    missing = [
        f"{lang}.{key}" for lang in LANGS for key in PARITY_KEYS if key not in strings[lang]
    ]
    check(not missing, f"every language defines every tested label (missing: {missing})")

    all_keys = {lang: set(strings[lang]) for lang in LANGS}
    for lang in LANGS[1:]:
        diff = all_keys["en"].symmetric_difference(all_keys[lang])
        check(not diff, f"[{lang}] dictionary has the same keys as English (diff: {sorted(diff)[:6]})")

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
    print("MANUAL: one real Turnstile submission per deployment — see e2e/MANUAL-TURNSTILE-CHECK.md")
    return 0 if not failures else 1


sys.exit(asyncio.run(main()))
