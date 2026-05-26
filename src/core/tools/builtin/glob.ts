import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const glob = (ctx: PluginInput) =>
  ({
    description: `
按 glob 模式快速匹配文件路径（如 \`**/*.ts\`），结果按修改时间排序。受 \`.gitignore\` 影响，被忽略的目录不会出现在结果中。
`.trim(),
    parameters: Schema.Struct({
      pattern: Schema.String.annotate({ description: "glob 匹配模式" }),
      path: Schema.optional(Schema.String).annotate({
        default: ctx.directory,
        description: "搜索目录的相对路径",
      }),
    }),
  }) as const;
