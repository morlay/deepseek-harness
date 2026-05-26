/**
 * Hashline engine — LINE#HASH:CONTENT 格式的内容锚点编辑。
 * 基于 oh-my-pi/pi-hashline-edit 简化实现，使用 Node.js 标准库 crypto。
 */

import { createHash } from "node:crypto";

/** 自定义哈希字母表（16字符，排除易混淆字符） */
const NIBBLE_STR = "ZPMQVRWSNKTXJBYH";
const DICT = Array.from({ length: 256 }, (_, i) => {
  const h = i >>> 4;
  const l = i & 0x0f;
  return `${NIBBLE_STR[h]}${NIBBLE_STR[l]}`;
});

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;

function xxh32(input: string, seed = 0): number {
  const h = createHash("sha256").update(`${seed}:${input}`).digest();
  return h.readUInt32BE(0) >>> 0;
}

/** 计算单行内容哈希（2字符） */
export function computeLineHash(idx: number, line: string): string {
  line = line.replace(/\r/g, "").trimEnd();
  let seed = 0;
  if (!RE_SIGNIFICANT.test(line)) {
    seed = idx;
  }
  return DICT[xxh32(line, seed) & 0xff]!;
}

/** 将多行内容格式化为 hashline 格式: LINE#HASH:CONTENT */
export function formatHashlineRegion(
  lines: string[],
  startLine: number,
): string {
  const lnw = String(startLine + Math.max(0, lines.length - 1)).length;
  return lines
    .map((line, index) => {
      const ln = startLine + index;
      return `${String(ln).padStart(lnw, " ")}#${computeLineHash(ln, line)}:${line}`;
    })
    .join("\n");
}

/** 解析 LINE#HASH 锚点引用 */
export function parseLineRef(ref: string): { line: number; hash: string } {
  const core = ref.replace(/^\s*[>+-]*\s*/, "").trimEnd();
  const match = core.match(/^([0-9]+)\s*#\s*([A-Z]{2})$/);
  if (!match)
    throw new Error(`[E_BAD_REF] 无效锚点 "${ref}"，期望格式 "LINE#HASH"`);
  return { line: Number.parseInt(match[1]!, 10), hash: match[2]! };
}

/** 将文件内容转为 hashline 格式 */
export function formatFileAsHashline(content: string): string {
  const lines = content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  return formatHashlineRegion(lines, 1);
}

// ─── Edit ────────────────────────────────────────────────

export type EditOp =
  | { op: "replace"; pos: string; end?: string; content: string }
  | { op: "append"; pos?: string; content: string }
  | { op: "prepend"; pos?: string; content: string }
  | { op: "delete"; pos: string; end?: string };

export interface EditResult {
  content: string;
  recovered: number;
}

/** 剥除 hashline 格式前缀 (LINE#HASH:)，提取纯文本内容 */
export function stripHashline(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+#[A-Z]{2}:/, ""))
    .join("\n");
}

/**
 * 类似 Go strings.Lines：保留每行末尾 \n 的行迭代器。
 * 空字符串不产出任何行。最后一行若不以 \n 结尾则不附带 \n。
 * 精确重建原始字符串用 join("")。
 */
export function* lines(content: string): Generator<string> {
  let remaining = content;
  while (remaining.length > 0) {
    const i = remaining.indexOf("\n");
    if (i >= 0) {
      yield remaining.slice(0, i + 1); // 包含 \n
      remaining = remaining.slice(i + 1);
    } else {
      yield remaining; // 最后一行，不带 \n
      remaining = "";
    }
  }
}

/** 类似 Go strings.Lines + 附上行号和哈希，一次遍历。 */
export function* hashlines(
  content: string,
): Generator<[{ lineNumber: number; hash: string }, string]> {
  let lineNumber = 1;
  for (const raw of lines(content)) {
    const lineContent = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    yield [{ lineNumber, hash: computeLineHash(lineNumber, lineContent) }, raw];
    lineNumber++;
  }
}

function editStartLine(edit: EditOp): number {
  if (edit.op === "replace" || edit.op === "delete") {
    return parseLineRef(edit.pos).line;
  }
  if (edit.pos) {
    return parseLineRef(edit.pos).line;
  }
  return edit.op === "append" ? Infinity : 0;
}

export function applyEdits(content: string, edits: EditOp[]): EditResult {
  const hadTrailingNewline = content.endsWith("\n");
  let recovered = 0;

  const sorted = [...edits].sort((a, b) => editStartLine(a) - editStartLine(b));
  let editIdx = 0;
  let skipTo = 0;

  function expectedHash(anchor: string | undefined): string | null {
    if (!anchor) return null;
    return parseLineRef(anchor).hash;
  }

  // result 存储不含 \n 的行，最终 join("\n")
  const result: string[] = [];

  // 文件头 prepend（无 pos）
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.op === "prepend" && !sorted[i]!.pos) {
      result.push(...(sorted[i] as { content: string }).content.split("\n"));
      sorted.splice(i, 1);
      i--;
    }
  }

  for (const hl of hashlines(content)) {
    const [meta, raw] = hl;
    const lineText = raw.endsWith("\n") ? raw.slice(0, -1) : raw;

    if (meta.lineNumber < skipTo) continue;

    const preLines: string[] = [];
    const postLines: string[] = [];
    let handled = false;

    while (
      editIdx < sorted.length &&
      editStartLine(sorted[editIdx]!) <= meta.lineNumber
    ) {
      const edit = sorted[editIdx]!;
      const startLine = editStartLine(edit);

      if (startLine < meta.lineNumber) {
        editIdx++;
        continue;
      }

      if (edit.op === "replace") {
        const posHash = expectedHash(edit.pos);
        if (posHash && meta.hash !== posHash)
          throw new Error(`[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`);
        let endLine = meta.lineNumber;
        if (edit.end) endLine = parseLineRef(edit.end).line;
        result.push(...edit.content.split("\n"));
        skipTo = endLine + 1;
        handled = true;
      } else if (edit.op === "delete") {
        const posHash = expectedHash(edit.pos);
        if (posHash && meta.hash !== posHash)
          throw new Error(`[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`);
        let endLine = meta.lineNumber;
        if (edit.end) endLine = parseLineRef(edit.end).line;
        skipTo = endLine + 1;
        handled = true;
      } else if (edit.op === "append") {
        if (edit.pos) {
          const posHash = expectedHash(edit.pos);
          if (posHash && meta.hash !== posHash)
            throw new Error(
              `[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`,
            );
        }
        postLines.push(...edit.content.split("\n"));
      } else if (edit.op === "prepend") {
        if (edit.pos) {
          const posHash = expectedHash(edit.pos);
          if (posHash && meta.hash !== posHash)
            throw new Error(
              `[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`,
            );
        }
        preLines.push(...edit.content.split("\n"));
      }

      editIdx++;
    }

    if (handled) continue;

    result.push(...preLines);
    result.push(lineText);
    result.push(...postLines);
  }

  // 检查未处理的 edits（锚点越界或不存在）
  for (let i = editIdx; i < sorted.length; i++) {
    const edit = sorted[i]!;
    if ((edit.op === "append" || edit.op === "prepend") && !edit.pos) continue;
    const anchor =
      edit.op === "replace" || edit.op === "delete" ? edit.pos : edit.pos!;
    throw new Error(`[E_NO_MATCH] 锚点 "${anchor}" 未找到或哈希不匹配`);
  }

  // 文件尾 append（无 pos）
  for (const edit of sorted) {
    if (edit.op === "append" && !edit.pos) {
      result.push(...edit.content.split("\n"));
    }
  }

  let resultStr = result.join("\n");
  if (hadTrailingNewline && resultStr.length > 0 && !resultStr.endsWith("\n")) {
    resultStr += "\n";
  }
  return { content: resultStr, recovered };
}

// ─── Streaming ──────────────────────────────────────────

/** 逐行产出 hashline 格式的异步生成器，适用于大文件流式读取 */
export async function* formatHashlineStream(
  lines: AsyncIterable<string>,
  startLine: number,
): AsyncGenerator<string> {
  let index = 0;
  for await (const line of lines) {
    const ln = startLine + index++;
    yield `${String(ln)}#${computeLineHash(ln, line)}:${line}`;
  }
}

/** 将 ripgrep 行号格式的结果转为 hashline 格式 */
export function formatGrepAsHashline(output: string): string {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^:]+):(\d+):(.*)/);
      if (!m) return line;
      const file = m[1]!;
      const ln = Number.parseInt(m[2]!, 10);
      const text = m[3]!;
      return `${file}:${ln}#${computeLineHash(ln, text)}:${text}`;
    })
    .join("\n");
}

/** 流式处理 ripgrep 输出，逐行转为 hashline 格式 */
export async function* formatGrepAsHashlineStream(
  lines: AsyncIterable<string>,
): AsyncGenerator<string> {
  for await (const raw of lines) {
    const m = raw.match(/^([^:]+):(\d+):(.*)/);
    if (!m) {
      yield raw;
      continue;
    }
    const file = m[1]!;
    const ln = Number.parseInt(m[2]!, 10);
    const text = m[3]!;
    yield `${file}:${ln}#${computeLineHash(ln, text)}:${text}`;
  }
}
