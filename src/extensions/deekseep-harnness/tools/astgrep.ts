import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import { astGrep } from "deepseek-harness/astgrep";
import { resolve } from "node:path";

export const astgrepTool = (cwd: string) =>
  tool({
    name: "astgrep",
    label: "astgrep",
    promptSnippet: "AST 模式搜索代码结构，不受格式/空格干扰",
    description: `
AST 模式搜索代码结构，不受格式/空格干扰。返回 \`file:line:col: text\`。
使用 \`$NAME\` 匹配标识符，\`$$$NAME\` 匹配多节点。
示例: astgrep(pattern: "export const $NAME = $VALUE", lang: "typescript", path: "src/")
`.trim(),
    parameters: Type.Object({
      pattern: Type.String({ description: "AST 匹配模式" }),
      lang: Type.Optional(
        Type.String({
          description: `解析语言。可选: html, javascript, js, jsx, tsx, css, typescript, ts, bash, c, cpp, c++, csharp, cs, elixir, ex, go, golang, haskell, hs, hcl, java, json, kotlin, kt, lua, nix, php, python, py, ruby, rb, rust, rs, scala, solidity, sol, swift, yaml, yml`,
        }),
      ),
      path: Type.Optional(Type.String({ description: "搜索的目录或文件" })),
    }),
    async execute(_toolCallId, args, _signal, _onUpdate, _ctx) {
      const dir = args.path ? resolve(cwd, args.path as string) : cwd;
      const matches = await astGrep(args.lang as string | undefined, {
        paths: [dir],
        pattern: args.pattern as string,
      });

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: "(no matches)" }],
          details: undefined,
        };
      }

      const text = matches
        .map((m) => `${m.file}:${m.line}:${m.column}: ${m.text}`)
        .join("\n");
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
