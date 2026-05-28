import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import { astEdit } from "deepseek-harness/astgrep";
import { resolve } from "node:path";

export const asteditTool = (cwd: string) =>
  tool({
    name: "astedit",
    label: "astedit",
    promptSnippet: "AST 结构化改写。pattern 搜索匹配，rewrite 替换",
    description: `
AST 结构化改写。pattern 搜索匹配，rewrite 替换（$ 变量展开为匹配到的原值）。
示例: astedit(pattern: "const $NAME = $VALUE", rewrite: "let $NAME = $VALUE", lang: "typescript")
`.trim(),
    parameters: Type.Object({
      pattern: Type.String({ description: "AST 匹配模式" }),
      rewrite: Type.String({
        description: "替换模板，使用相同的 $ 变量",
      }),
      lang: Type.Optional(
        Type.String({
          description: `解析语言。可选: html, javascript, js, jsx, tsx, css, typescript, ts, bash, c, cpp, c++, csharp, cs, elixir, ex, go, golang, haskell, hs, hcl, java, json, kotlin, kt, lua, nix, php, python, py, ruby, rb, rust, rs, scala, solidity, sol, swift, yaml, yml`,
        }),
      ),
      path: Type.Optional(Type.String({ description: "搜索的目录或文件" })),
    }),
    async execute(_toolCallId, args, _signal, _onUpdate, _ctx) {
      const dir = args.path ? resolve(cwd, args.path as string) : cwd;
      const results = await astEdit(args.lang as string | undefined, {
        paths: [dir],
        pattern: args.pattern as string,
        rewrite: args.rewrite as string,
      });

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "(no changes)" }],
          details: undefined,
        };
      }

      const text = results
        .map((r) => `${r.file}: ${r.count} 处替换`)
        .join("\n");
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
