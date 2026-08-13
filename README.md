# Fraud Doctor

Build a fraud scam checker web app called "Fraud Doctor — Scam Detector" for seniors and their families in Canada.

WHAT IT DOES:
The user pastes or types a suspicious text message, email, phone script, or website URL into a text box. The app analyzes it and tells them clearly whether it looks like a scam, what type of scam it is, how dangerous it is, and exactly what to do next.

DESIGN:
- Clean, trustworthy, medical theme — navy blue (#0a1628) and gold (#c9a84c) colors
- Very large text throughout — this is for seniors
- Simple layout, nothing cluttered
- Header says "The Fraud Doctor" with a stethoscope icon
- Subheading: "Paste a suspicious message below and I'll check it for you"
- Big friendly "Check This Message" button in gold
- Results appear below in a clear "diagnosis" card format

RESULT CARD should show:
- A clear verdict at the top: SCAM / LIKELY SCAM / LOOKS SAFE (with color coding — red, orange, green)
- Scam type (e.g. "CRA Impersonation Scam", "Grandparent Scam", "Bank Fraud")
- A danger level indicator (High / Medium / Low)
- Plain English explanation of WHY it looks like a scam — 2-3 sentences a senior can understand
- A "What to do now" section with 3 simple bullet points
- A "Report this scam" button that links to the Canadian Anti-Fraud Centre (https://www.antifraudcentre-centreantifraude.ca)

EXTRA FEATURES:
- A "Recent Scams in Canada" section below showing 3 current scam alerts as cards
- A footer with "The Fraud Doctor | Vancouver, BC | hello@thefrauddoctor.ca"
- Mobile friendly — many seniors use tablets and phones

TONE:
Warm, calm, reassuring — never alarming or technical. Like a trusted doctor giving a diagnosis in plain English. Never say "I cannot determine" — always give a clear

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://frauddoctor-care.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6177fe6d-cdb5-43a9-89f4-235bb7d1d073).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
