import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const sg = (_ctx: PluginInput) =>
  ({
    description: `
使用 ast-grep 做结构化搜索和改写。基于 AST 精确匹配语法节点。搜索: pattern:"($$$PARAMS) => $BODY", lang:"typescript"。改写: pattern:"var $X = $Y", rewrite:"const $X = $Y", lang:"typescript", update:true — 默认仅预览 diff。
输出格式：搜索返回 \`文件路径:行号:行号: 匹配内容\`，无匹配返回 "(no matches)"。改写预览返回 diff，执行后返回汇总。
`.trim(),
    parameters: Schema.Struct({
      pattern: Schema.String.annotate({
        description:
          "AST 匹配模式。使用 $NAME 匹配单个节点，$$$NAME 匹配多个节点",
      }),
      lang: Schema.optional(Schema.String).annotate({
        description: "解析语言 (如 'typescript', 'python', 'rust')",
      }),
      rewrite: Schema.optional(Schema.String).annotate({
        description: "改写模式下的替换模式",
      }),
      update: Schema.optional(Schema.Boolean).annotate({
        description: "是否实际写入文件（默认 false）",
      }),
      path: Schema.optional(Schema.String).annotate({
        description: "搜索的目录或文件（相对路径）",
      }),
    }),
  }) as const;
