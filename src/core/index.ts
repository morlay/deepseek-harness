import type { PluginModule } from "@opencode-ai/plugin";

import { merge } from "es-toolkit";
import * as agents from "./agents/index.ts";
import { hashread } from "./tools/hashread.ts";
import { hashedit } from "./tools/hashedit.ts";
import { hashgrep } from "./tools/hashgrep.ts";
import { astgrep } from "./tools/astgrep.ts";
import { astedit } from "./tools/astedit.ts";
import { applyOverwrites } from "./tools/builtin/applyOverwrites.ts";

export default {
  id: "deepseek-harness",
  server: async (ctx) => {
    return {
      config: async (config) => {
        config.agent ??= {};
        config.agent.code = merge(config.agent.code ?? {}, { ...agents.code });
        config.agent.chat = merge(config.agent.chat ?? {}, { ...agents.chat });
        config.agent.doc = merge(config.agent.doc ?? {}, { ...agents.doc });
        config.agent.worker = merge(config.agent.worker ?? {}, {
          ...agents.worker,
        });

        // 务必关闭，与 hashline 不匹配，任务完成后或提交时，统一 format
        config.formatter = false;
      },
      tool: {
        hashread: hashread(),
        hashedit: hashedit(),
        hashgrep: hashgrep(),
        astgrep: astgrep(),
        astedit: astedit(),
      },
      "tool.definition": async (input: any, output: any) => {
        applyOverwrites(ctx, output, input.toolID);
      },
    };
  },
} satisfies PluginModule;
