import { type AgentConfig } from "@opencode-ai/sdk/v2";
import { readPromptWithShared, withPermission } from "./_shared.ts";

export const doc = {
  mode: "primary" as const,
  prompt: await readPromptWithShared("doc.md"),
  temperature: 0.0,
  top_p: 0.9,
  permission: withPermission(true),
} satisfies AgentConfig;
