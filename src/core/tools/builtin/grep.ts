import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const grep = (ctx: PluginInput) =>
  ({
    description: `
按正则模式搜索文件内容，返回匹配的文件路径和行号。受 \`.gitignore\` 影响，被忽略的目录可能搜索不到。
示例: grep(pattern: "export const", include: "*.ts")
`.trim(),
    parameters: Schema.Struct({
      pattern: Schema.String.annotate({ description: "正则匹配模式" }),
      path: Schema.optional(Schema.String).annotate({
        default: ctx.directory,
        description: "搜索目录的相对路径",
      }),
      include: Schema.optional(Schema.String).annotate({
        description: "文件过滤 glob 模式，如 `*.ts`",
      }),
    }),
  }) as const;
