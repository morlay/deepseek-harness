import type { PluginModule } from "@opencode-ai/plugin";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { merge } from "es-toolkit";
import * as tools from "./tools/index.ts";
import * as agents from "./agents/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  id: "deepseek-harness",
  server: async (ctx) => {
    return {
      config: async (config) => {
        config.agent ??= {};
        config.agent.code = merge({ ...agents.code }, config.agent.code ?? {});
        config.agent.chat = merge({ ...agents.chat }, config.agent.chat ?? {});
        config.agent.doc = merge({ ...agents.doc }, config.agent.doc ?? {});
        config.agent.worker = merge(
          { ...agents.worker },
          config.agent.worker ?? {},
        );
      },
      tool: {
        sg: tools.sg(ctx),
        patch: tools.patch(ctx),
      },
      "tool.definition": async (input, output) => {
        tools.applyOverwrites(ctx, output, input.toolID);
      },
    };
  },
} satisfies PluginModule;
