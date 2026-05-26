import { tool } from "@opencode-ai/plugin";
import { readFile, writeFile as fsWriteFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SgNode } from "@ast-grep/napi";
import { astFindInFiles } from "../../astgrep/astgrep.ts";

function expandRewrite(rewrite: string, node: SgNode): string {
  return rewrite.replace(/\$(\w+)/g, (_, name) => {
    const matched = node.getMatch(name);
    return matched ? matched.text() : `$${name}`;
  });
}

export const astedit = () =>
  tool({
    description: `
AST 结构化改写。dryRun=true 仅预览 diff，dryRun=false 写入文件。pattern 搜索匹配，rewrite 替换（$ 变量展开为匹配到的原值）。
示例: astedit(pattern: "const $NAME = $VALUE", rewrite: "let $NAME = $VALUE", lang: "typescript", dryRun: false)
`.trim(),
    args: {
      pattern: tool.schema.string().meta({ description: "AST 匹配模式" }),
      rewrite: tool.schema
        .string()
        .meta({ description: "替换模板，使用相同的 $ 变量" }),
      lang: tool.schema
        .string()
        .optional()
        .meta({ description: "解析语言 (如 TypeScript, Python, Rust)" }),
      path: tool.schema
        .string()
        .optional()
        .meta({ description: "搜索的目录或文件" }),
      dryRun: tool.schema
        .boolean()
        .optional()
        .meta({ description: "是否仅预览 diff（默认 true）" }),
    },
    async execute(args, ctx) {
      const dir = args.path ? resolve(ctx.directory, args.path) : ctx.directory;
      const isDryRun = args.dryRun !== false;
      const results: string[] = [];
      const fileEdits = new Map<
        string,
        Array<{ oldText: string; newText: string }>
      >();

      await astFindInFiles(
        args.lang,
        { paths: [dir], pattern: args.pattern },
        (_err, nodes) => {
          for (const node of nodes) {
            const filePath = node.getRoot().filename();
            const oldText = node.text();
            const expanded = expandRewrite(args.rewrite, node);
            if (isDryRun) {
              const range = node.range();
              results.push(
                `--- ${filePath}:${range.start.line + 1}\n- ${oldText}\n+ ${expanded}`,
              );
            } else {
              if (!fileEdits.has(filePath)) fileEdits.set(filePath, []);
              fileEdits.get(filePath)!.push({ oldText, newText: expanded });
            }
          }
        },
      );

      if (!isDryRun) {
        for (const [filePath, edits] of fileEdits) {
          let content = await readFile(filePath, "utf-8");
          for (const { oldText, newText } of edits) {
            content = content.replace(oldText, newText);
          }
          await fsWriteFile(filePath, content, "utf-8");
          results.push(`${filePath}: ${edits.length} 处替换`);
        }
      }

      if (results.length === 0) return { output: "(no changes)" };
      return { output: results.join("\n\n") };
    },
  });
