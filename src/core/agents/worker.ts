import { type AgentConfig } from "@opencode-ai/sdk/v2";
import { readPromptWithShared, sharedBashPermission } from "./_shared.ts";

export const worker = {
  mode: "subagent" as const,
  prompt: await readPromptWithShared("worker.md"),
  temperature: 0.0,
  top_p: 0.9,
  model: "deepseek/deepseek-v4-flash",
  permission: {
    bash: sharedBashPermission,
  },
} satisfies AgentConfig;
