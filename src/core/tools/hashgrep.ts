import { tool } from "@opencode-ai/plugin";
import { resolve } from "node:path";
import { grepAsHashline } from "../../hashline/index.ts";

export const hashgrep = () =>
  tool({
    description: `
正则搜索文本（ripgrep）。按文件拆分，每文件首行为路径，后续为 \`LINE#HASH:content\` 锚点，可直接用于 hashedit。
示例: hashgrep(pattern: "subtract", include: "*.ts", path: "src/")
`.trim(),
    args: {
      pattern: tool.schema
        .string()
        .min(1)
        .meta({ description: "正则匹配模式（PCRE）" }),
      path: tool.schema
        .string()
        .optional()
        .meta({ description: "搜索目录的路径，默认当前工作目录" }),
      include: tool.schema
        .string()
        .optional()
        .meta({ description: "文件过滤 glob 模式，如 *.ts" }),
    },
    async execute(args, ctx) {
      if (args.pattern.length === 0) {
        throw new Error("hashgrep: pattern 不能为空");
      }
      const dir = args.path ? resolve(ctx.directory, args.path) : ctx.directory;
      const results: string[] = [];
      for await (const line of grepAsHashline(
        args.pattern,
        dir,
        args.include,
      )) {
        results.push(line);
      }
      return { output: results.join("\n") || "(无匹配)" };
    },
  });
