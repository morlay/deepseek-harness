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
  | { op: "replace"; pos: string; end?: string; lines: string[] }
  | { op: "append"; pos?: string; lines: string[] }
  | { op: "prepend"; pos?: string; lines: string[] }
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

/** 归一化行数组：尾换行不产生空尾元素 */
function getLines(content: string): string[] {
  const lines = content.split("\n");
  if (content.endsWith("\n") && lines.length > 0) lines.pop();
  return lines;
}

function resolveAnchor(
  content: string,
  anchor: string,
): { lineNumber: number } | null {
  const { line, hash } = parseLineRef(anchor);
  const fileLines = getLines(content);
  if (line < 1 || line > fileLines.length) return null;
  const actualLine = fileLines[line - 1]!;
  if (computeLineHash(line, actualLine) !== hash) return null;
  return { lineNumber: line };
}

export function applyEdits(content: string, edits: EditOp[]): EditResult {
  let result = content;
  let recovered = 0;
  const hadTrailingNewline = content.endsWith("\n");

  const sorted = [...edits].sort((a, b) => {
    const aLine =
      a.op === "replace" || a.op === "delete"
        ? (resolveAnchor(content, a.pos)?.lineNumber ?? 0)
        : a.op === "append" || a.op === "prepend"
          ? a.pos
            ? (resolveAnchor(content, a.pos)?.lineNumber ?? 0)
            : a.op === "append"
              ? Infinity
              : 0
          : 0;
    const bLine =
      b.op === "replace" || b.op === "delete"
        ? (resolveAnchor(content, b.pos)?.lineNumber ?? 0)
        : b.op === "append" || b.op === "prepend"
          ? b.pos
            ? (resolveAnchor(content, b.pos)?.lineNumber ?? 0)
            : b.op === "append"
              ? Infinity
              : 0
          : 0;
    return bLine - aLine;
  });

  for (const edit of sorted) {
    const fileLines = getLines(result);

    switch (edit.op) {
      case "replace": {
        const resolved = resolveAnchor(result, edit.pos);
        if (!resolved)
          throw new Error(`[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`);
        let endLine = resolved.lineNumber;
        if (edit.end) {
          const er = resolveAnchor(result, edit.end);
          if (!er)
            throw new Error(
              `[E_NO_MATCH] 锚点 "${edit.end}" 未找到或哈希不匹配`,
            );
          endLine = er.lineNumber;
        }
        result = [
          ...fileLines.slice(0, resolved.lineNumber - 1),
          ...edit.lines,
          ...fileLines.slice(endLine),
        ].join("\n");
        break;
      }
      case "append":
      case "prepend": {
        if (edit.lines.length === 0) break;
        if (!edit.pos) {
          if (edit.op === "append") {
            if (result.length === 0) result = edit.lines.join("\n");
            else if (result.endsWith("\n")) result += edit.lines.join("\n");
            else result += "\n" + edit.lines.join("\n");
          } else {
            if (result.length === 0) result = edit.lines.join("\n");
            else result = edit.lines.join("\n") + "\n" + result;
          }
          break;
        }
        const resolved = resolveAnchor(result, edit.pos);
        if (!resolved)
          throw new Error(`[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`);
        const idx =
          edit.op === "append" ? resolved.lineNumber : resolved.lineNumber - 1;
        result = [
          ...fileLines.slice(0, idx),
          ...edit.lines,
          ...fileLines.slice(idx),
        ].join("\n");
        break;
      }
      case "delete": {
        const resolved = resolveAnchor(result, edit.pos);
        if (!resolved)
          throw new Error(`[E_NO_MATCH] 锚点 "${edit.pos}" 未找到或哈希不匹配`);
        let endLine = resolved.lineNumber;
        if (edit.end) {
          const er = resolveAnchor(result, edit.end);
          if (!er)
            throw new Error(
              `[E_NO_MATCH] 锚点 "${edit.end}" 未找到或哈希不匹配`,
            );
          endLine = er.lineNumber;
        }
        result = [
          ...fileLines.slice(0, resolved.lineNumber - 1),
          ...fileLines.slice(endLine),
        ].join("\n");
        break;
      }
    }
  }

  if (hadTrailingNewline && result.length > 0 && !result.endsWith("\n")) {
    result += "\n";
  }

  return { content: result, recovered };
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
