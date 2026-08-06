import { defineMcp } from "@lovable.dev/mcp-js";
import checkMessageTool from "./tools/check-message";
import listRecentScamsTool from "./tools/list-recent-scams";
import reportingInfoTool from "./tools/reporting-info";

export default defineMcp({
  name: "fraud-doctor",
  title: "Fraud Doctor",
  version: "0.1.0",
  instructions:
    "Tools from Fraud Doctor, a scam detector for Canadians. Use `check_message` to diagnose a suspicious text, email, phone script, or URL — it returns a verdict, scam type, danger level, plain-English explanation, next steps, and live URL threat checks. Use `list_recent_scams` for current Canadian scam alerts and `get_reporting_info` for official reporting channels.",
  tools: [checkMessageTool, listRecentScamsTool, reportingInfoTool],
});
