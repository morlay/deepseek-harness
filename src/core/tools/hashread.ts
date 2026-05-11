import { tool } from "@opencode-ai/plugin";
import { rgPath } from "@vscode/ripgrep";
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { formatHashlineRegion } from "../../hashline/index.ts";

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

export const hashread = () =>
  tool({
    description:
      "读取文件（每行带 `LINE#HASH:` 锚点）或列出目录。\n" +
      '示例: hashread({ filePath: "src/app.ts" })、hashread({ filePath: "src/app.ts", offset: 5, limit: 10 })',
    args: {
      filePath: tool.schema
        .string()
        .meta({ description: "文件或目录的相对路径" }),
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
        .optional()
        .meta({ description: "最大读取行数，默认 2000" }),
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
      const proc = spawn(
        rgPath,
        ["--line-number", "--no-heading", ".", absPath],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      const stdout = await readAll(proc.stdout!);
      const code = await new Promise<number>((r) => proc.on("close", r));
      if (code !== 0) return { output: "" };
      const lines = stdout
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const m = l.match(/^(\d+):(.*)/);
          return m ? { line: Number.parseInt(m[1]!, 10), text: m[2]! } : null;
        })
        .filter((x): x is { line: number; text: string } => x !== null);
      const start = (args.offset ?? 1) - 1;
      const end = args.limit ? start + args.limit : undefined;
      const sliced = lines.slice(start, end);
      return {
        output: formatHashlineRegion(
          sliced.map((x) => x.text),
          sliced[0]?.line ?? 1,
        ),
      };
    },
  });
