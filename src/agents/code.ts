import { type AgentConfig } from "@opencode-ai/sdk/v2";
import { readPromptWithShared, sharedBashPermission } from "./_shared.ts";

export const code = {
  mode: "primary",
  prompt: await readPromptWithShared("code.md"),
  temperature: 0.0,
  top_p: 0.9,
  permission: {
    bash: sharedBashPermission,
  },
} satisfies AgentConfig;
