import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const skill = (_ctx: PluginInput) =>
  ({
    description: "加载指定 skill 的完整指令和资源到当前对话上下文。",
    parameters: Schema.Struct({
      name: Schema.String.annotate({ description: "skill 名称" }),
    }),
  }) as const;
