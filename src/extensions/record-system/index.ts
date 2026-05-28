import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { activeTools } from "deepseek-harness/pikit";

export default function (pi: ExtensionAPI) {
  pi.on("agent_start", async (_, ctx) => {
    pi.appendEntry("system", {
      prompt: ctx?.getSystemPrompt(),
      tools: activeTools(pi, { schemaOnly: true }),
    });
  });
}
