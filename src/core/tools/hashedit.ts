import { tool } from "@opencode-ai/plugin";
import {
  readFile,
  writeFile as fsWriteFile,
  mkdir,
  rm,
  rename,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { applyEdits, parseLineRef, type EditOp } from "../../hashline/index.ts";

const lineRefSchema = tool.schema
  .string()
  .regex(/^\d+#[A-Z]{2}$/, "格式 LINE#HASH 如 2#AB");

const editOpSchema = tool.schema.discriminatedUnion("op", [
  tool.schema.object({
    op: tool.schema.literal("delete"),
    pos: lineRefSchema.meta({ description: "起始锚点" }),
    end: lineRefSchema.optional().meta({ description: "结束锚点（可选范围）" }),
  }),
  tool.schema.object({
    op: tool.schema.literal("append"),
    pos: lineRefSchema
      .optional()
      .meta({ description: "锚点；不传则追加到文件末尾" }),
    content: tool.schema
      .string()
      .meta({ description: "追加内容，多行用 \\n 分隔" }),
  }),
  tool.schema.object({
    op: tool.schema.literal("prepend"),
    pos: lineRefSchema.meta({ description: "锚点" }),
    content: tool.schema
      .string()
      .meta({ description: "插入内容，多行用 \\n 分隔" }),
  }),
]);

export const hashedit = () =>
  tool({
    description: `
单文件编辑/删除/重命名。锚点来自 hashread 或 hashgrep。
edits 支持三种操作：
  delete:  删除 pos 行；传 end 则删除 pos~end 范围
  append:  在 pos 行后追加 content（无 pos 则追加到文件末尾）
  prepend: 在 pos 行前插入 content
pos/end 为单个 LINE#HASH 锚点；同文件多处修改请传多条 edit。
替换内容请先 delete 再 append/prepend，不要在一次调用中混合删除和插入不同行。
无锚点 append 可创建新文件，父目录自动创建。
返回 diff（-LINE#HASH 为被删旧行，+LINE#HASH 为当前最新锚点），+ 锚点可直接用于下一轮编辑。
若编辑改变了行号（删除/插入等），末尾追加 @line(>N, line => line + delta) 指示受影响行的行号偏移，用于推算旧锚点的新行号。
示例: hashedit(filePath: "a.ts", edits: [{ op: "append", content: "new line" }, { op: "delete", pos: "1#AB" }])
`.trim(),
    args: {
      filePath: tool.schema.string().meta({ description: "文件路径" }),
      edits: tool.schema
        .array(editOpSchema)
        .optional()
        .meta({ description: "编辑操作列表（与 delete/rename 互斥）" }),
      delete: tool.schema
        .boolean()
        .optional()
        .meta({ description: "设为 true 时删除该文件" }),
      rename: tool.schema.string().optional().meta({
        description: "目标路径（重命名/移动），不能与 edits/delete 同时使用",
      }),
    },
    async execute(args, ctx) {
      const {
        filePath,
        edits,
        delete: del,
        rename: ren,
      } = args as {
        filePath: string;
        edits?: ToolEditInput[];
        delete?: boolean;
        rename?: string;
      };

      if (!filePath) {
        throw new Error("hashedit: 需要 filePath 参数");
      }

      const absPath = resolve(ctx.directory, filePath);

      if (ren) {
        const dest = resolve(ctx.directory, ren);
        await mkdir(dirname(dest), { recursive: true });
        await rename(absPath, dest);
        return { output: `M ${filePath} → ${ren}` };
      }

      if (del) {
        try {
          await rm(absPath, { force: true });
          return { output: `D ${filePath}` };
        } catch {
          return { output: `D ${filePath} (不存在)` };
        }
      }

      if (!Array.isArray(edits) || edits.length === 0) {
        throw new Error(`hashedit: ${filePath} 需要 edits、delete 或 rename`);
      }

      const expandedEdits = edits.map((e) => toEditOp(filePath, e));

      let content: string;
      try {
        content = await readFile(absPath, "utf-8");
      } catch {
        const canCreate = expandedEdits.every(
          (e) => e.op === "append" && !e.pos,
        );
        if (canCreate) {
          const result = applyEdits("", expandedEdits);
          await mkdir(dirname(absPath), { recursive: true });
          await fsWriteFile(absPath, result.content, "utf-8");
          const changed = result.changed ? `\n${result.changed}` : "";
          return { output: `+ ${filePath}${changed}` };
        }
        throw new Error(`文件不存在: ${filePath}`);
      }

      const result = applyEdits(content, expandedEdits);
      await fsWriteFile(absPath, result.content, "utf-8");

      const changed = result.changed ? `\n${result.changed}` : "";
      return { output: `E ${filePath}${changed}` };
    },
  });

type ToolEditInput = {
  op: "append" | "prepend" | "delete";
  pos?: string;
  end?: string;
  content?: string;
};

function toEditOp(filePath: string, edit: ToolEditInput): EditOp {
  if (edit.op === "append") {
    const content = edit.content ?? "";
    if (!edit.pos) return { op: "append", content };
    return { op: "append", pos: normalizeAnchor(edit.pos), content };
  }

  if (!edit.pos) {
    throw new Error(`hashedit: ${filePath} 的 ${edit.op} 需要 pos 锚点`);
  }
  const pos = normalizeAnchor(edit.pos);

  if (edit.op === "prepend") {
    const content = edit.content ?? "";
    return { op: "prepend", pos, content };
  }

  // delete
  return {
    op: "delete",
    pos,
    ...(edit.end ? { end: normalizeAnchor(edit.end) } : {}),
  };
}

function normalizeAnchor(anchor: string): string {
  parseLineRef(anchor);
  return anchor;
}
