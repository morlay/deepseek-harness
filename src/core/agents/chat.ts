import { type AgentConfig } from "@opencode-ai/sdk/v2";

export const chat = {
  mode: "primary" as const,
  prompt: "",
  temperature: 0.7,
  top_p: 0.9,
  permission: {
    "*": "deny",
    webfetch: "allow",
  },
} satisfies AgentConfig;
