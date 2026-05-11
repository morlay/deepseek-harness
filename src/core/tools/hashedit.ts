import { tool } from "@opencode-ai/plugin";
import {
  readFile,
  writeFile as fsWriteFile,
  mkdir,
  rm,
  rename,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { applyEdits, type EditOp } from "../../hashline/index.ts";

export const hashedit = () =>
  tool({
    description:
      "跨文件批量编辑/删除/重命名。ops 每项 { filePath, edits }、{ filePath, delete:true } 或 { filePath, rename }。edits 支持 replace/append/prepend/delete，锚点来自 hashread 或 hashgrep。pos/end 支持 string|string[]。\n" +
      '示例: hashedit({ ops: [{ filePath: "a.ts", edits: [{ op: "replace", pos: "2#AB", lines: ["new"] }] }, { filePath: "b.ts", delete: true }, { filePath: "old.ts", rename: "new.ts" }] })',
    args: {
      ops: tool.schema
        .array(
          tool.schema.object({
            filePath: tool.schema
              .string()
              .meta({ description: "文件相对路径" }),
            edits: tool.schema
              .array(
                tool.schema.object({
                  op: tool.schema
                    .enum(["replace", "append", "prepend", "delete"])
                    .meta({ description: "操作类型" }),
                  pos: tool.schema
                    .union([
                      tool.schema.string(),
                      tool.schema.array(tool.schema.string()),
                    ])
                    .optional()
                    .meta({ description: "锚点 LINE#HASH 或数组" }),
                  end: tool.schema
                    .union([
                      tool.schema.string(),
                      tool.schema.array(tool.schema.string()),
                    ])
                    .optional()
                    .meta({
                      description:
                        "结束锚点（replace/delete 范围），数组与 pos 等长",
                    }),
                  lines: tool.schema
                    .array(tool.schema.string())
                    .optional()
                    .meta({ description: "新内容行" }),
                }),
              )
              .optional()
              .meta({ description: "编辑操作列表（与 delete/rename 互斥）" }),
            delete: tool.schema
              .boolean()
              .optional()
              .meta({ description: "设为 true 时删除该文件" }),
            rename: tool.schema.string().optional().meta({
              description:
                "目标路径（重命名/移动），不能与 edits/delete 同时使用",
            }),
          }),
        )
        .min(1)
        .meta({ description: "跨文件批量操作" }),
    },
    async execute(args, ctx) {
      const ops = args.ops as {
        filePath: string;
        edits?: {
          op: string;
          pos?: string | string[];
          end?: string | string[];
          lines?: string[];
        }[];
        delete?: boolean;
        rename?: string;
      }[];

      if (!Array.isArray(ops) || ops.length === 0) {
        throw new Error("hashedit: 需要 ops 参数");
      }

      const outputs: string[] = [];
      let totalFiles = 0;
      let totalEdits = 0;
      let totalRecovered = 0;

      for (const op of ops) {
        const absPath = resolve(ctx.directory, op.filePath);

        if (op.rename) {
          const dest = resolve(ctx.directory, op.rename);
          await mkdir(dirname(dest), { recursive: true });
          await rename(absPath, dest);
          outputs.push(`→ ${op.filePath} → ${op.rename}`);
          totalFiles++;
          continue;
        }

        if (op.delete) {
          try {
            await rm(absPath, { force: true });
            outputs.push(`✗ ${op.filePath}`);
            totalFiles++;
          } catch {
            outputs.push(`✗ ${op.filePath} (不存在)`);
          }
          continue;
        }

        if (!Array.isArray(op.edits) || op.edits.length === 0) {
          throw new Error(
            `hashedit: ${op.filePath} 需要 edits、delete 或 rename`,
          );
        }

        const expandedEdits: EditOp[] = [];
        for (const e of op.edits) {
          const posArr = normalizeAnchor(e.pos);
          const endArr = normalizeAnchor(e.end);

          if (posArr.length === 0) {
            expandedEdits.push({ op: e.op, lines: e.lines } as EditOp);
          } else if (endArr.length > 0 && endArr.length !== posArr.length) {
            throw new Error(
              `pos/end 长度不匹配 (${posArr.length} vs ${endArr.length}): ${op.filePath}`,
            );
          } else {
            for (let i = 0; i < posArr.length; i++) {
              expandedEdits.push({
                op: e.op,
                pos: posArr[i]!,
                end: endArr[i] ?? undefined,
                lines: e.lines,
              } as EditOp);
            }
          }
        }

        let content: string;
        try {
          content = await readFile(absPath, "utf-8");
        } catch {
          const canCreate = expandedEdits.every(
            (e) => (e.op === "append" || e.op === "prepend") && !e.pos,
          );
          if (canCreate) {
            await mkdir(dirname(absPath), { recursive: true });
            await fsWriteFile(
              absPath,
              expandedEdits.flatMap((e: any) => e.lines ?? []).join("\n"),
              "utf-8",
            );
            outputs.push(`+ ${op.filePath}`);
            totalFiles++;
            totalEdits += expandedEdits.length;
            continue;
          }
          throw new Error(`文件不存在: ${op.filePath}`);
        }

        const result = applyEdits(content, expandedEdits);
        await fsWriteFile(absPath, result.content, "utf-8");

        totalFiles++;
        totalEdits += expandedEdits.length;
        totalRecovered += result.recovered;

        const status =
          result.recovered > 0
            ? `~ ${op.filePath} (${result.recovered}/${expandedEdits.length} 恢复)`
            : `✓ ${op.filePath}`;
        outputs.push(status);
      }

      const rec = totalRecovered > 0 ? ` (${totalRecovered} 恢复)` : "";
      return {
        output: `已处理 ${totalFiles} 文件/${totalEdits} 处${rec}:\n${outputs.join("\n")}`,
      };
    },
  });

function normalizeAnchor(a: string | string[] | undefined): string[] {
  if (!a) return [];
  return Array.isArray(a) ? a : [a];
}
