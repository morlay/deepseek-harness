import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const write = (_ctx: PluginInput) =>
  ({
    description: "将内容写入文件（全量覆盖）。父目录不存在时自动创建。",
    parameters: Schema.Struct({
      content: Schema.String.annotate({ description: "要写入的内容" }),
      filePath: Schema.String.annotate({
        description: "文件的绝对路径",
      }),
    }),
  }) as const;
