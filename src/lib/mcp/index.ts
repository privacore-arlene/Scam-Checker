import { auth, defineMcp } from "@lovable.dev/mcp-js";
import checkMessageTool from "./tools/check-message";
import listRecentScamsTool from "./tools/list-recent-scams";
import reportingInfoTool from "./tools/reporting-info";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "fraud-doctor",
  title: "Fraud Doctor",
  version: "0.1.0",
  instructions:
    "Tools from Fraud Doctor, a scam detector for Canadians. Use `check_message` to diagnose a suspicious text, email, phone script, or URL — it returns a verdict, scam type, danger level, plain-English explanation, next steps, and live URL threat checks. Use `list_recent_scams` for current Canadian scam alerts and `get_reporting_info` for official reporting channels.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [checkMessageTool, listRecentScamsTool, reportingInfoTool],
});

