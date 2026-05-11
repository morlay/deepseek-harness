import { spawn } from "node:child_process";
import { tool } from "@opencode-ai/plugin/tool";
import type { PluginInput } from "@opencode-ai/plugin";

export const sg = (_ctx: PluginInput) =>
  tool({
    description: `
使用 ast-grep (sg) 做结构化搜索和改写。基于 AST 精确匹配语法节点——重命名、类型调整等代码重构优先用 sg(rewrite)，不会像文本替换一样误改注释或字符串。

搜索: sg(pattern:"($$$PARAMS) => $BODY", lang:"typescript")
改写: sg(pattern:"var $X = $Y", rewrite:"const $X = $Y", lang:"typescript", update:true) — 默认只预览 diff，update 为 true 才写入文件。

输出格式：搜索返回 \`文件路径:行号:起始列:结束列: 匹配内容\`（每行一个匹配），无匹配返回 "(no matches)"。改写预览返回 diff，执行后返回 "改写已写入文件"。

Pattern 需与实际 AST 节点结构匹配，不吻合时返回空，可调整 pattern 重试。
`.trim(),
    args: {
      pattern: tool.schema
        .string()
        .describe(
          "AST 匹配模式。使用 $NAME 匹配单个节点，$$$NAME 匹配多个节点",
        ),
      lang: tool.schema
        .string()
        .optional()
        .describe(
          "解析语言 (如 'typescript', 'python', 'rust')，省略时自动检测",
        ),
      rewrite: tool.schema
        .string()
        .optional()
        .describe("改写模式下的替换模式。使用与 pattern 相同的 $ 变量"),
      update: tool.schema
        .boolean()
        .optional()
        .describe("是否实际写入文件（默认 false，仅预览 diff）"),
      options: tool.schema
        .string()
        .optional()
        .describe("附加 sg 参数，以单个字符串形式传递 (如 '--interleaved')"),
      path: tool.schema
        .string()
        .optional()
        .describe("搜索的目录或文件（相对路径）"),
    },

    async execute(args, ctx) {
      const dir = args.path ?? ".";

      const argv = ["sg"];

      if (args.lang) argv.push("--lang", args.lang);

      if (args.rewrite) {
        argv.push("--pattern", args.pattern, "--rewrite", args.rewrite);
        if (args.update) argv.push("-U");
      } else {
        argv.push("--pattern", args.pattern);
      }

      if (args.options) {
        const opts = args.options.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
        argv.push(...opts.map((o) => o.replace(/^"|"$/g, "")));
      }

      argv.push(dir);

      const proc = spawn("sg", argv.slice(1), {
        cwd: ctx.directory,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return new Promise((resolve, reject) => {
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];

        proc.stdout!.on("data", (chunk) => stdout.push(chunk));
        proc.stderr!.on("data", (chunk) => stderr.push(chunk));

        proc.on("close", (exitCode) => {
          if (exitCode === 0) {
            const out = Buffer.concat(stdout).toString();
            if (args.update) {
              resolve({
                output: out || "改写已写入文件",
                metadata: {},
              });
            } else {
              resolve({
                output: out || "(no matches)",
                metadata: { count: out.split("\n").filter(Boolean).length },
              });
            }
          } else {
            const errMsg = Buffer.concat(stderr).toString();
            reject(new Error(errMsg || `sg exited with code ${exitCode}`));
          }
        });

        proc.on("error", (err) => {
          reject(
            new Error(
              `sg 执行异常：${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        });
      });
    },
  });
