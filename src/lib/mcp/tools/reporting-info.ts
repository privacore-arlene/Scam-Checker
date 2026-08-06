import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "get_reporting_info",
  title: "How to report fraud in Canada",
  description:
    "Get the official Canadian fraud reporting channels and next steps to take after being targeted by a scam.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const info = {
      canadian_anti_fraud_centre: {
        phone: "1-888-495-8501",
        website: "https://www.antifraudcentre-centreantifraude.ca",
        hours: "Monday to Friday, 10 a.m. to 4:45 p.m. Eastern",
      },
      steps: [
        "Do not click links, open attachments, scan QR codes, or reply to the message.",
        "If money was sent, call your bank right away and ask about a recall or fraud claim.",
        "Report the scam to the Canadian Anti-Fraud Centre at 1-888-495-8501.",
        "Report it to your local police if you lost money or your identity was used.",
        "Tell a family member or friend — scammers rely on people staying silent.",
      ],
    };

    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      structuredContent: info,
    };
  },
});
