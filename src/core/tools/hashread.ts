import { tool } from "@opencode-ai/plugin";
import { readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { grepAsHashline } from "../../hashline/index.ts";

function hashlineLineNumber(line: string): number | undefined {
  const hashIndex = line.indexOf("#");
  if (hashIndex <= 0) return undefined;
  const n = Number.parseInt(line.slice(0, hashIndex), 10);
  return Number.isFinite(n) ? n : undefined;
}

export const hashread = () =>
  tool({
    description: `
读取文件（每行带 \`LINE#HASH:\` 锚点）或列出目录。
示例: hashread(filePath: "src/app.ts")、hashread(filePath: "src/app.ts", offset: 5, limit: 10)
`.trim(),
    args: {
      filePath: tool.schema.string().meta({ description: "文件或目录的路径" }),
      offset: tool.schema
        .number()
        .int()
        .min(1)
        .optional()
        .meta({ description: "起始行号（从 1 开始）" }),
      limit: tool.schema
        .number()
        .int()
        .min(1)
        .max(2000)
        .meta({ description: "最大读取行数" }),
    },
    async execute(args, ctx) {
      const absPath = resolve(ctx.directory, args.filePath);
      let s: { isDirectory(): boolean };
      try {
        s = await stat(absPath);
      } catch {
        return { output: `路径不存在: ${args.filePath}` };
      }
      if (s.isDirectory()) {
        const entries = await readdir(absPath, { withFileTypes: true });
        const rel = relative(ctx.worktree ?? ctx.directory, absPath) || ".";
        const items = entries
          .map((e) => `${e.isDirectory() ? "[D]" : "[F]"} ${e.name}`)
          .join("\n");
        return { output: `${rel}/ (${entries.length} 项)\n${items}` };
      }
      // read = grepAsHashline(".", absPath) — 单文件，取首 block 跳首行
      for await (const block of grepAsHashline(".", absPath)) {
        const lines = block.split("\n");
        lines.shift(); // 去掉首行文件路径
        const defaultLimit = 2000;
        const start = args.offset ?? 1;
        const end = start + (args.limit ?? defaultLimit);
        const output = lines.filter((line) => {
          const n = hashlineLineNumber(line);
          return n !== undefined && n >= start && n < end;
        });
        return { output: output.join("\n") };
      }
      return { output: "" };
    },
  });
