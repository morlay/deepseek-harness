import { tool } from "@opencode-ai/plugin";
import { rgPath } from "@vscode/ripgrep";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { formatGrepAsHashline } from "../../hashline/index.ts";

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

export const hashgrep = () =>
  tool({
    description:
      "正则搜索文本（ripgrep）。返回 `file:LINE#HASH:content` 格式，锚点直接用于 hashedit。\n" +
      '示例: hashgrep({ pattern: "subtract", include: "*.ts", path: "src/" })',
    args: {
      pattern: tool.schema
        .string()
        .meta({ description: "正则匹配模式（PCRE）" }),
      path: tool.schema
        .string()
        .optional()
        .meta({ description: "搜索目录的相对路径，默认当前工作目录" }),
      include: tool.schema
        .string()
        .optional()
        .meta({ description: "文件过滤 glob 模式，如 *.ts" }),
    },
    async execute(args, ctx) {
      const dir = args.path ? resolve(ctx.directory, args.path) : ctx.directory;
      const argv = ["--line-number", "--no-heading"];
      if (args.include) argv.push("--glob", args.include);
      argv.push("--", args.pattern, dir);
      const proc = spawn(rgPath, argv, { stdio: ["pipe", "pipe", "pipe"] });
      const stdout = await readAll(proc.stdout!);
      const code = await new Promise<number>((r) => proc.on("close", r));
      if (code === 1 && !stdout.trim()) return { output: "(无匹配)" };
      if (code !== 0 && code !== 1)
        throw new Error(await readAll(proc.stderr!));
      return { output: formatGrepAsHashline(stdout.trim()) || "(无匹配)" };
    },
  });
