# Language check: does the diagnosis come back in all 4 languages?

## What already works

When someone pastes a message or screenshot, the app sends the chosen language along with it. The doctor's diagnosis is written in that language:

- Traditional Chinese, Simplified Chinese and Punjabi are all passed through and requested explicitly.
- Translated by the AI: scam type, the "Why" explanation, red flags, the three STOP / VERIFY / CALL sentences, and the "What to do now" bullets.
- Translated from your own wording file: every button, heading, placeholder, limit message, lead form, share links and disclaimer, plus the verdict wording (Scam / Likely a scam / Looks safe).
- Kept in English on purpose: CRA, Interac, Canadian Anti-Fraud Centre, and phone numbers — correct, since a senior needs to say those names out loud.

## The two gaps

1. **Danger level** shows `High`, `Medium`, `Low` in English even when the rest of the card is in Chinese or Punjabi.
2. **Link scan result** — when a link is confirmed dangerous, the reason (for example `social engineering`) is shown as the raw English label from the security database.

Everything else on the results card follows the language switcher.

## Proposed fix

- Add wording for High / Medium / Low in all four languages and display the translated label next to the danger badge.
- Add wording for the common link-threat reasons (malware, phishing / social engineering, unwanted software, potentially harmful app) in all four languages, falling back to the raw label if a new reason appears.
- No change to the analysis logic, limits, or the AI prompt.

## Technical notes

- `src/lib/i18n.tsx`: add `danger_high`/`danger_medium`/`danger_low` and `threat_*` keys to the en, zh-Hant, zh-Hans and pa dictionaries.
- `src/components/FraudChecker.tsx`: map `d.danger_level` and the Safe Browsing / VirusTotal threat string through `t()` instead of rendering them directly.
