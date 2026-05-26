import { tool } from "@opencode-ai/plugin";
import { resolve } from "node:path";
import { astFindInFiles } from "../../astgrep/astgrep.ts";

export const astgrep = () =>
  tool({
    description: `
AST 模式搜索代码结构，不受格式/空格干扰。返回 \`file:line:col: text\`。使用 \`$NAME\` 匹配标识符，\`$$$NAME\` 匹配多节点。
示例: astgrep(pattern: "export const $NAME = $VALUE", lang: "typescript", path: "src/")
`.trim(),
    args: {
      pattern: tool.schema.string().meta({ description: "AST 匹配模式" }),
      lang: tool.schema
        .string()
        .optional()
        .meta({ description: "解析语言 (如 TypeScript, Python, Rust)" }),
      path: tool.schema
        .string()
        .optional()
        .meta({ description: "搜索的目录或文件" }),
    },
    async execute(args, ctx) {
      const dir = args.path ? resolve(ctx.directory, args.path) : ctx.directory;
      const matches: string[] = [];

      await astFindInFiles(
        args.lang,
        { paths: [dir], pattern: args.pattern },
        (_err, nodes) => {
          for (const node of nodes) {
            const range = node.range();
            const file = node.getRoot().filename();
            matches.push(
              `${file}:${range.start.line + 1}:${range.start.column + 1}: ${node.text()}`,
            );
          }
        },
      );

      if (matches.length === 0) return { output: "(no matches)" };
      return { output: matches.join("\n") };
    },
  });
