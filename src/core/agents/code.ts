import { type AgentConfig } from "@opencode-ai/sdk/v2";
import { readPromptWithShared, sharedBashPermission } from "./_shared.ts";

export const code = {
  mode: "primary",
  prompt: await readPromptWithShared("code.md"),
  temperature: 0.0,
  top_p: 0.9,
  tools: {
    // 仅暴露自定义工具 + 未被替换的内置工具
    hashread: true,
    hashedit: true,
    hashgrep: true,
    astgrep: true,
    astedit: true,
    glob: true,
    write: true,
    bash: true,
    lsp: true,
    skill: true,
    task: true,
    todowrite: true,
    webfetch: true,
  },
  permission: {
    bash: sharedBashPermission,
  },
} satisfies AgentConfig;
