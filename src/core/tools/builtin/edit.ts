import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const edit = (_ctx: PluginInput) =>
  ({
    description: "精确字符串替换编辑已有文件",
    parameters: Schema.Struct({
      filePath: Schema.String.annotate({
        description: "文件的相对路径",
      }),
      oldString: Schema.String.annotate({ description: "要替换的原始文本" }),
      newString: Schema.String.annotate({ description: "替换后的新文本" }),
      replaceAll: Schema.optional(Schema.Boolean).annotate({
        default: false,
        description: "替换所有匹配项",
      }),
    }),
  }) as const;
