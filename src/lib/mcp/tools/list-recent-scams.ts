import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const RECENT_SCAMS = [
  {
    title: "RCMP 'Court Delivery' Text",
    channel: "text message",
    source: "RCMP Warning · Jan 2025",
    summary:
      "Text says the RCMP couldn't deliver court documents and you must click a link to reschedule. The RCMP never sends texts. Don't click — delete and report.",
  },
  {
    title: "RCMP 'Summons' Email with PDF",
    channel: "email",
    source: "Saskatchewan RCMP · Feb 2026",
    summary:
      "Email with an RCMP crest claims 'unacceptable activity' on your network and attaches a PDF summons. The sender domain is fake. Don't open the attachment.",
  },
  {
    title: "RCMP 'Sexual Offences' Extortion Email",
    channel: "email",
    source: "RCMP Newfoundland · Jan 2026",
    summary:
      "Email signed by a fake 'RCMP Commissioner' threatens an arrest warrant to scare you into paying. It is not real. Don't respond — call your local police.",
  },
  {
    title: "Fake Police Video Call Scam",
    channel: "text message or email",
    source: "Manitoba RCMP · Feb 2026",
    summary:
      "A message invites you to a video call with a 'police officer' who demands gift cards or Bitcoin. Real police never hold video calls or ask for crypto.",
  },
  {
    title: "Parking Ticket Text Scam",
    channel: "text message",
    source: "Vancouver, West Vancouver, Saskatoon · 2025–2026",
    summary:
      "Text demands immediate payment for an unpaid parking ticket via a link. Cities do not send parking notices by SMS. Check your city's website directly.",
  },
  {
    title: "Fake 'Fine Collection Branch' Email",
    channel: "email",
    source: "Saskatchewan RCMP · Feb 2026",
    summary:
      "Email pretends to be from a provincial fine collection office with a fake payment link. Verify by calling the number on the official government website.",
  },
  {
    title: "Fake Parking Meter QR Codes (quishing)",
    channel: "QR code in person",
    source: "Vancouver, Whistler, Penticton · Late 2025",
    summary:
      "Fraudulent QR stickers placed over real ones on parking meters lead to fake payment sites that steal credit card info. Use the official parking app instead.",
  },
  {
    title: "CRA GST/HST Refund Phishing",
    channel: "email or text message",
    source: "Active Canada-wide",
    summary:
      "Message offers a tax refund and asks you to 'complete an application' via a link. The CRA never sends refund links. Log in at canada.ca directly.",
  },
  {
    title: "CRA/RCMP Crypto Warrant Scam",
    channel: "phone call",
    source: "Active Canada-wide",
    summary:
      "Caller claims you have an arrest warrant and must send Bitcoin to 'cancel' it. The CRA never demands crypto. Hang up immediately.",
  },
] as const;

export default defineTool({
  name: "list_recent_scams",
  title: "List recent Canadian scams",
  description:
    "List the current scam alerts Fraud Doctor tracks in Canada, including the channel used, the reporting source, and what to do about each one.",
  inputSchema: {
    query: z
      .string()
      .trim()
      .optional()
      .describe("Optional keyword to filter alerts, for example 'parking', 'CRA', or 'QR'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query }) => {
    const needle = query?.toLowerCase();
    const scams = needle
      ? RECENT_SCAMS.filter((scam) =>
          `${scam.title} ${scam.channel} ${scam.summary}`.toLowerCase().includes(needle),
        )
      : [...RECENT_SCAMS];

    return {
      content: [{ type: "text", text: JSON.stringify(scams, null, 2) }],
      structuredContent: { count: scams.length, scams },
    };
  },
});
