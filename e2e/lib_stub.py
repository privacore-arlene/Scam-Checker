"""Shared helpers for the Fraud Doctor end-to-end checks.

IMPORTANT — Turnstile policy
----------------------------
Production Cloudflare Turnstile is NOT weakened, mocked or disabled anywhere in
the application. These headless tests replace the Turnstile *browser script*
inside the test browser only, so the interface past the widget can be exercised.
The Supabase function still requires a real, valid Turnstile token, so the
`/functions/v1/check-scam` response is also stubbed in the test browser when a
rendered diagnosis card is what is under test.

A real end-to-end submission with a genuine Turnstile token cannot be produced
by headless Chromium and MUST be verified once, manually, by a human after
deployment (see e2e/MANUAL-TURNSTILE-CHECK.md).
"""

import json

TURNSTILE_STUB = (
    "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('test-token')},50);"
    "return 'w1'},reset:function(){},remove:function(){}};"
)

HIGH_DIAGNOSIS = {
    "verdict": "HIGH RISK",
    "scam_type": "CRA impersonation",
    "danger_level": "High",
    "explanation": "The message threatens arrest and demands immediate payment.",
    "red_flags": ["Threat of arrest", "Demands e-transfer or Bitcoin"],
    "what_to_do": ["Do not reply.", "Delete the message."],
    "framework": {
        "stop": "Do not reply, click or pay.",
        "verify": "Look up the CRA number yourself.",
        "call": "Call the CRA at 1-800-959-8281.",
    },
    "impersonation": True,
    "verification_needed": True,
    "url_check": {
        "checked": False,
        "urls_found": ["http://cra-refund-secure-verify.com"],
        "confirmed_threats": {},
        "sources": {"link_reputation": "disabled"},
    },
}

CAREFUL_DIAGNOSIS = dict(
    HIGH_DIAGNOSIS,
    verdict="BE CAREFUL",
    danger_level="Medium",
    scam_type="Unverified sender",
    explanation="Some wording is concerning and the sender cannot be confirmed.",
)

LOW_DIAGNOSIS = dict(
    HIGH_DIAGNOSIS,
    verdict="NO KNOWN WARNING FOUND",
    danger_level="Low",
    scam_type="None obvious",
    explanation="Nothing in the wording stood out.",
    red_flags=[],
    impersonation=False,
    verification_needed=False,
    url_check={
        "checked": False,
        "urls_found": [],
        "confirmed_threats": {},
        "sources": {"link_reputation": "disabled"},
    },
)

# ---------------------------------------------------------------------------
# Named samples used by the "What should I do now?" rendering checks.
# ---------------------------------------------------------------------------

# A clean canada.ca link: Web Risk returned no match, nothing was flagged.
# Expected rendering: NO KNOWN WARNING FOUND, the cautionary note, and NO
# "What should I do now?" section at all (nothing to report or act on).
CANADA_CLEAN_DIAGNOSIS = dict(
    LOW_DIAGNOSIS,
    scam_type="No known warning signs in the wording",
    explanation=(
        "Nothing in this wording matched a known scam pattern. "
        "That is not proof the sender or the page is genuine."
    ),
    red_flags=[],
    what_to_do=["Verify anything to do with money or personal information yourself."],
    url_check={
        "checked": True,
        "urls_found": ["https://www.canada.ca/en/revenue-agency.html"],
        "confirmed_threats": {},
        "sources": {"link_reputation": "google_web_risk"},
    },
)

# RCMP 'summons' email carrying a malware link that Web Risk flagged.
# Expected rendering: HIGH RISK, escalation notice, and the full
# "What should I do now?" section with all four options.
RCMP_MALWARE_DIAGNOSIS = dict(
    HIGH_DIAGNOSIS,
    scam_type="RCMP impersonation with malicious attachment link",
    danger_level="High",
    explanation=(
        "This email impersonates the RCMP, claims a summons has been issued and "
        "pushes you to open an attachment link. The link is on a known-threat list."
    ),
    red_flags=[
        "Claims to be the RCMP and threatens legal action",
        "Pushes you to open an attachment immediately",
        "Link is flagged as dangerous",
    ],
    what_to_do=["Do not open the attachment.", "Do not reply."],
    framework={
        "stop": "Do not open the attachment or click the link.",
        "verify": "The RCMP does not email summonses.",
        "call": "Call your local RCMP detachment using a number you look up yourself.",
    },
    url_check={
        "checked": True,
        "urls_found": ["http://rcmp-summons-notice-file.com/summons.pdf"],
        "confirmed_threats": {
            "http://rcmp-summons-notice-file.com/summons.pdf": ["MALWARE"],
        },
        "sources": {"link_reputation": "google_web_risk"},
    },
)


async def stub_turnstile(page) -> None:
    async def handler(route):
        await route.fulfill(
            status=200, content_type="application/javascript", body=TURNSTILE_STUB
        )

    await page.route("**/turnstile/**", handler)


async def stub_diagnosis(page, diagnosis: dict) -> None:
    payload = json.dumps(diagnosis)

    async def handler(route, *_a, payload=payload):
        await route.fulfill(status=200, content_type="application/json", body=payload)

    await page.route("**/check-scam", handler)


async def wait_for_turnstile(page) -> None:
    await page.wait_for_function("typeof window.turnstile === 'object'", timeout=15_000)
    await page.wait_for_timeout(1_500)
