import { tool } from "@opencode-ai/plugin/tool";
import type { PluginInput } from "@opencode-ai/plugin";
import {
  readFile,
  writeFile,
  unlink,
  rename as fsRename,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { tryRemoveEmptyDir, applyActions } from "./_internal/patch.ts";
import type { PatchAction } from "./_internal/patch.ts";
import { mkdir } from "node:fs/promises";

export const patch = (_p: PluginInput) =>
  tool({
    description: `
批量精确修改文件，用结构化 JSON 替代 diff 格式。支持替换、插入、删除、重命名，可一次处理多个文件。

操作：
- \`replace\` + \`old\` — 精确字符串匹配替换。\`old\` 为原文本，\`replace\` 为新文本。⚠️ \`replace\` 与 \`old\` 不能相同，否则无任何效果。⚠️ 每对 \`replace\`/\`old\` 只替换首次出现，若同一文本在多处出现，需在 actions 中列出多个 \`replace\` 操作，逐个给出各处的完整行原文。
- \`insert\` + \`after\` — 在 \`after\` 行之后插入 \`insert\`。\`after\` 不传或为空时追加到文件末尾（文件不存在则创建）。
- \`rename\` — 重命名/移动文件。\`filePath\` 为原路径，\`rename\` 为新路径。不能与 \`actions\` 或 \`delete\` 同时使用。
- \`delete\` — 删除文件。

示例：
\`calls: [{ filePath: "src/a.ts", actions: [{ replace: "const x = 1", old: "const x = 0" }] }, { filePath: "src/b.ts", delete: true }]\`
\`calls: [{ filePath: "src/app.ts", actions: [{ insert: "import { foo } from './foo'", after: "import { bar } from './bar'" }] }]\`
\`calls: [{ filePath: "new.ts", actions: [{ insert: "export const x = 1" }] }]\`  — 创建文件并写入
\`calls: [{ filePath: "old-name.ts", rename: "new-name.ts" }]\`  — 重命名文件
`.trim(),
    args: {
      calls: tool.schema
        .array(
          tool.schema.object({
            filePath: tool.schema.string().describe("文件相对路径"),
            actions: tool.schema
              .array(
                tool.schema.union([
                  tool.schema.object({
                    replace: tool.schema.string().describe("替换为新文本"),
                    old: tool.schema
                      .string()
                      .describe("要替换的原文本，精确匹配"),
                  }),
                  tool.schema.object({
                    insert: tool.schema.string().describe("要插入的文本"),
                    after: tool.schema
                      .string()
                      .optional()
                      .describe("在该行之后插入；为空时追加到文件末尾"),
                  }),
                ]),
              )
              .optional()
              .describe("操作列表，按数组顺序依次执行"),
            rename: tool.schema
              .string()
              .optional()
              .describe(
                "目标文件路径（重命名/移动），不能与 actions/delete 同时使用",
              ),
            delete: tool.schema
              .boolean()
              .optional()
              .describe("设为 true 时删除该文件"),
          }),
        )
        .describe("批量操作列表"),
    },
    async execute(args, ctx) {
      for (const call of args.calls) {
        const filePath = resolve(ctx.directory, call.filePath);

        if (call.delete) {
          await unlink(filePath);
          await tryRemoveEmptyDir(dirname(filePath), ctx.directory);
          continue;
        }

        if (call.rename) {
          if (call.actions || call.delete) {
            throw new Error(
              `rename 不能与 actions 或 delete 同时使用 (${call.filePath})`,
            );
          }
          const targetPath = resolve(ctx.directory, call.rename);
          await mkdir(dirname(targetPath), { recursive: true });
          await fsRename(filePath, targetPath);
          continue;
        }

        if (!call.actions || call.actions.length === 0) {
          throw new Error(
            `缺少 actions、rename 或 delete 参数 (${call.filePath})`,
          );
        }

        const source = await readFile(filePath, "utf-8").catch(() => {
          // 文件不存在时：如果所有 action 都是 insert，允许从空内容创建
          const canCreate = call.actions!.every(
            (a: PatchAction) => "insert" in a,
          );
          if (canCreate) return "";
          throw new Error(`文件不存在: ${call.filePath}`);
        });

        const result = applyActions(source, call.actions as PatchAction[]);
        await writeFile(filePath, result, "utf-8");
      }

      const summary = args.calls
        .map((c) => {
          if (c.delete) return `${c.filePath} 已删除`;
          if (c.rename) return `${c.filePath} → ${c.rename} 已重命名`;
          const n = c.actions?.length ?? 0;
          return `${c.filePath} 已执行 ${n} 个操作`;
        })
        .join("\n");

      return {
        output: summary,
        metadata: {},
      };
    },
  });
