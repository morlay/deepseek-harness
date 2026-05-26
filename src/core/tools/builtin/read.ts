import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const read = (_ctx: PluginInput) =>
  ({
    description: "读取文件内容或目录列表。",
    parameters: Schema.Struct({
      filePath: Schema.String.annotate({
        description: "文件或目录的相对路径",
      }),
      offset: Schema.optional(PositiveInt).annotate({
        description: "起始行号（从 1 开始）",
      }),
      limit: Schema.optional(PositiveInt).annotate({
        default: 2000,
        description: "最大读取行数",
      }),
    }),
  }) as const;
