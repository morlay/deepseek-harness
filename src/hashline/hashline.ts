// LINE#HASH
export type Pos = string;

export type EditOp =
  | {
      // 用 content 替换 pos~end 范围的整段内容
      op: "replace";
      pos: Pos;
      end?: Pos;
      content: string;
    }
  | {
      // 向后插入内容, 无 pos 时
      op: "append";
      pos?: Pos;
      content: string;
    }
  | {
      // 在指定行前面插入内容
      op: "prepend";
      pos: Pos;
      content: string;
    }
  | {
      // 单行或范围删除
      op: "delete";
      pos: Pos;
      end?: Pos;
    };

// 多行格式，类似 diff, 连续区域先删后减
// -LINE#HASH
// +LINE#HASH
type Changed = string;

export interface EditResult {
  content: string;
  changed: Changed;
}

/** 自定义哈希字母表（16字符，排除易混淆字符） */
const NIBBLE_STR = "ZPMQVRWSNKTXJBYH";
const DICT = Array.from({ length: 256 }, (_, i) => {
  const h = i >>> 4;
  const l = i & 0x0f;
  return `${NIBBLE_STR[h]}${NIBBLE_STR[l]}`;
});

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixHash32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function hash32(input: string, seed = 0): number {
  let h = (FNV_OFFSET ^ seed) >>> 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h ^= code & 0xff;
    h = Math.imul(h, FNV_PRIME);
    h ^= code >>> 8;
    h = Math.imul(h, FNV_PRIME);
  }
  return mixHash32(h ^ input.length);
}

/** 计算单行内容哈希（2字符） */
export function computeLineHash(idx: number, line: string): string {
  line = line.trimEnd();
  if (line.includes("\r")) line = line.replaceAll("\r", "");
  let seed = 0;
  if (!RE_SIGNIFICANT.test(line)) {
    seed = idx;
  }
  return DICT[hash32(line, seed) & 0xff]!;
}

export function parseLineRef(ref: string): { line: number; hash: string } {
  let index = skipAsciiWhitespace(ref, 0);
  while (index < ref.length) {
    const code = ref.charCodeAt(index);
    if (code !== 43 && code !== 45 && code !== 62) break;
    index++;
  }
  index = skipAsciiWhitespace(ref, index);

  const lineStart = index;
  while (index < ref.length && isAsciiDigit(ref.charCodeAt(index))) index++;
  if (index === lineStart) return badLineRef(ref);

  const line = Number.parseInt(ref.slice(lineStart, index), 10);
  index = skipAsciiWhitespace(ref, index);
  if (ref.charCodeAt(index) !== 35) return badLineRef(ref);
  index = skipAsciiWhitespace(ref, index + 1);

  if (
    index + 2 > ref.length ||
    !isUpperAsciiLetter(ref.charCodeAt(index)) ||
    !isUpperAsciiLetter(ref.charCodeAt(index + 1))
  ) {
    return badLineRef(ref);
  }
  const hash = ref.slice(index, index + 2);
  index = skipAsciiWhitespace(ref, index + 2);
  if (index !== ref.length) return badLineRef(ref);
  return { line, hash };
}

function badLineRef(ref: string): never {
  throw new Error(`[E_BAD_REF] 无效锚点 "${ref}"，期望格式 "LINE#HASH"`);
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isUpperAsciiLetter(code: number): boolean {
  return code >= 65 && code <= 90;
}

function isAsciiWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

function skipAsciiWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && isAsciiWhitespace(text.charCodeAt(index))) {
    index++;
  }
  return index;
}

export function formatFileAsHashline(content: string): string {
  const output: string[] = [];
  forEachLineSpan(content, (start, end, lineNumber) => {
    const text = lineText(content, start, end);
    if (text.length > 0) {
      output.push(`${lineNumber}#${computeLineHash(lineNumber, text)}:${text}`);
    }
  });
  return output.join("\n");
}

function forEachLineSpan(
  content: string,
  visit: (start: number, end: number, lineNumber: number) => void,
) {
  let start = 0;
  let lineNumber = 1;
  while (start < content.length) {
    const end = content.indexOf("\n", start);
    if (end === -1) {
      visit(start, content.length, lineNumber);
      break;
    }
    visit(start, end + 1, lineNumber);
    start = end + 1;
    lineNumber++;
  }
}

interface LineRecord {
  lineNumber: number;
  hash: string;
  start: number;
  end: number;
  endsWithNewline: boolean;
}

type PreparedEdit =
  | {
      op: "replace";
      order: number;
      start: number;
      end: number;
      replacement: string;
    }
  | { op: "delete"; order: number; start: number; end: number }
  | { op: "append"; order: number; index: number; content: string }
  | { op: "prepend"; order: number; index: number; content: string }
  | { op: "append-eof"; order: number; content: string };

type RangeEdit = Extract<PreparedEdit, { op: "replace" | "delete" }>;

function lineText(content: string, start: number, end: number): string {
  let textEnd = end;
  if (textEnd > start && content.charCodeAt(textEnd - 1) === 10) {
    textEnd--;
    if (textEnd > start && content.charCodeAt(textEnd - 1) === 13) {
      textEnd--;
    }
  }
  return content.slice(start, textEnd);
}

function toLineRecords(content: string): LineRecord[] {
  const records: LineRecord[] = [];
  forEachLineSpan(content, (start, end, lineNumber) => {
    const text = lineText(content, start, end);
    records.push({
      lineNumber,
      hash: computeLineHash(lineNumber, text),
      start,
      end,
      endsWithNewline: content.charCodeAt(end - 1) === 10,
    });
  });
  return records;
}

function rawLineTexts(text: string): string[] {
  const texts: string[] = [];
  forEachLineSpan(text, (start, end) => texts.push(lineText(text, start, end)));
  return texts;
}

function editContentLines(text: string): string[] {
  return rawLineTexts(text);
}

function changedLine(prefix: "-" | "+", lineNumber: number, text: string) {
  return `${prefix}${lineNumber}#${computeLineHash(lineNumber, text)}`;
}

function anchorNoMatch(anchor: string): never {
  throw new Error(`[E_NO_MATCH] 锚点 "${anchor}" 未找到或哈希不匹配`);
}

function resolveAnchor(records: LineRecord[], anchor: string): LineRecord {
  const ref = parseLineRef(anchor);
  const record = records[ref.line - 1];
  if (!record || record.hash !== ref.hash) anchorNoMatch(anchor);
  return record;
}

function assertRange(start: LineRecord, end: LineRecord, edit: EditOp) {
  if (end.lineNumber < start.lineNumber) {
    const endRef =
      edit.op === "replace" || edit.op === "delete" ? edit.end : undefined;
    throw new Error(
      `[E_BAD_RANGE] 结束锚点 "${endRef}" 不能早于起始锚点 "${edit.pos}"`,
    );
  }
}

function insertionBeforeLine(content: string): string {
  if (content.length === 0) return "";
  return content.endsWith("\n") ? content : `${content}\n`;
}

function insertionAfterLine(
  lineEndsWithNewline: boolean,
  content: string,
): string {
  if (content.length === 0) return "";
  const prefix = lineEndsWithNewline ? "" : "\n";
  const suffix = lineEndsWithNewline && !content.endsWith("\n") ? "\n" : "";
  return `${prefix}${content}${suffix}`;
}

function contentLineCount(content: string): number {
  let count = 0;
  forEachLineSpan(content, () => {
    count++;
  });
  return count;
}

function insertionAtEof(currentContent: string, content: string): string {
  if (content.length === 0) return "";
  if (currentContent.length === 0) return content;
  const prefix = currentContent.endsWith("\n") ? "" : "\n";
  const suffix =
    currentContent.endsWith("\n") && !content.endsWith("\n") ? "\n" : "";
  return `${prefix}${content}${suffix}`;
}

function appendChanged(
  changes: string[],
  prefix: "-" | "+",
  startLine: number,
  texts: string[],
) {
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!;
    if (text.length === 0) continue;
    changes.push(changedLine(prefix, startLine + i, text));
  }
}

function joinRawRecords(
  content: string,
  records: LineRecord[],
  start: number,
  end: number,
) {
  return content.slice(records[start]!.start, records[end]!.end);
}

function prepareEdit(
  content: string,
  records: LineRecord[],
  edit: EditOp,
  order: number,
): PreparedEdit {
  if (edit.op === "append" && !edit.pos) {
    return { op: "append-eof", order, content: edit.content };
  }

  if (!edit.pos) {
    throw new Error(`[E_BAD_REF] ${edit.op}.pos 不能为空`);
  }

  const start = resolveAnchor(records, edit.pos);
  const startIndex = start.lineNumber - 1;

  if (edit.op === "append") {
    return { op: "append", order, index: startIndex, content: edit.content };
  }
  if (edit.op === "prepend") {
    return { op: "prepend", order, index: startIndex, content: edit.content };
  }

  const end = edit.end ? resolveAnchor(records, edit.end) : start;
  assertRange(start, end, edit);
  const endIndex = end.lineNumber - 1;

  if (edit.op === "delete") {
    return { op: "delete", order, start: startIndex, end: endIndex };
  }
  const suffix = records[endIndex]!.endsWithNewline && !edit.content.endsWith("\n") ? "\n" : "";
  return {
    op: "replace",
    order,
    start: startIndex,
    end: endIndex,
    replacement: edit.content + suffix,
  };

}

function isRangeEdit(edit: PreparedEdit): edit is RangeEdit {
  return edit.op === "replace" || edit.op === "delete";
}

function editIndex(edit: PreparedEdit): number {
  if (isRangeEdit(edit)) return edit.start;
  if (edit.op === "append-eof") return Number.POSITIVE_INFINITY;
  return edit.index;
}

function editPhase(edit: PreparedEdit): number {
  if (edit.op === "prepend") return 0;
  if (isRangeEdit(edit)) return 1;
  if (edit.op === "append") return 2;
  return 3;
}

function comparePreparedEdit(a: PreparedEdit, b: PreparedEdit): number {
  return (
    editIndex(a) - editIndex(b) ||
    editPhase(a) - editPhase(b) ||
    a.order - b.order
  );
}

function assertNoOverlappingEdits(edits: PreparedEdit[]) {
  let rangeEnd = -1;
  for (const edit of edits) {
    if (edit.op !== "append-eof" && editIndex(edit) <= rangeEnd) {
      throw new Error("[E_OVERLAP] 编辑范围不能重叠");
    }
    if (isRangeEdit(edit)) rangeEnd = edit.end;
  }
}

function appendOriginalRange(
  output: string[],
  content: string,
  cursor: number,
  end: number,
): number {
  if (cursor < end) {
    output.push(content.slice(cursor, end));
  }
  return end;
}

export function applyEdits(content: string, edits: EditOp[]): EditResult {
  const records = toLineRecords(content);
  const prepared = edits.map((edit, order) =>
    prepareEdit(content, records, edit, order),
  );
  prepared.sort(comparePreparedEdit);
  assertNoOverlappingEdits(prepared);

  const changes: string[] = [];
  const output: string[] = [];
  let cursor = 0;
  let currentContent: string | undefined;
  let currentLineCount = 0;

  for (const edit of prepared) {
    if (edit.op === "append-eof") {
      cursor = appendOriginalRange(output, content, cursor, content.length);
      currentContent ??= output.join("");
      if (currentLineCount === 0) {
        currentLineCount = contentLineCount(currentContent);
      }
      const insertedTexts = editContentLines(edit.content);
      const insertion = insertionAtEof(currentContent, edit.content);
      output.push(insertion);
      appendChanged(changes, "+", currentLineCount + 1, insertedTexts);
      currentContent += insertion;
      currentLineCount += insertedTexts.length;
      continue;
    }

    if (edit.op === "prepend") {
      cursor = appendOriginalRange(
        output,
        content,
        cursor,
        records[edit.index]!.start,
      );
      const line = records[edit.index]!;
      output.push(insertionBeforeLine(edit.content));
      appendChanged(
        changes,
        "+",
        line.lineNumber,
        editContentLines(edit.content),
      );
      continue;
    }

    if (edit.op === "append") {
      cursor = appendOriginalRange(
        output,
        content,
        cursor,
        records[edit.index]!.end,
      );
      const line = records[edit.index]!;
      output.push(insertionAfterLine(line.endsWithNewline, edit.content));
      appendChanged(
        changes,
        "+",
        line.lineNumber + 1,
        editContentLines(edit.content),
      );
      continue;
    }

    cursor = appendOriginalRange(
      output,
      content,
      cursor,
      records[edit.start]!.start,
    );
    const line = records[edit.start]!;
    const selected = joinRawRecords(content, records, edit.start, edit.end);
    appendChanged(changes, "-", line.lineNumber, rawLineTexts(selected));
    if (edit.op === "replace") {
      output.push(edit.replacement);
      appendChanged(
        changes,
        "+",
        line.lineNumber,
        rawLineTexts(edit.replacement),
      );
    } else if (
      edit.end === records.length - 1 &&
      !records[edit.end]!.endsWithNewline &&
      output.at(-1)?.endsWith("\n")
    ) {
      const previous = output.pop()!;
      output.push(previous.slice(0, -1));
    }
    cursor = records[edit.end]!.end;
  }

  if (currentContent === undefined) {
    appendOriginalRange(output, content, cursor, content.length);
    currentContent = output.join("");
  }

  // 计算行号偏移：遍历已排序的 prepared，记录所有非零偏移区间
  let currentDelta = 0;
  let lastAfter = 0;
  for (const edit of prepared) {
    let delta = 0;
    let afterLine = 0;
    if (edit.op === "delete") {
      delta = -(edit.end - edit.start + 1);
      afterLine = records[edit.end]!.lineNumber;
    } else if (edit.op === "replace") {
      const oldCount = rawLineTexts(
        joinRawRecords(content, records, edit.start, edit.end),
      ).length;
      const newCount = rawLineTexts(edit.replacement).length;
      delta = newCount - oldCount;
      afterLine = records[edit.end]!.lineNumber;
    } else if (edit.op === "append") {
      delta = rawLineTexts(edit.content).length;
      afterLine = records[edit.index]!.lineNumber;
    } else if (edit.op === "prepend") {
      delta = rawLineTexts(edit.content).length;
      afterLine = records[edit.index]!.lineNumber - 1;
    }
    if (delta === 0) continue;
    const prevDelta = currentDelta;
    currentDelta += delta;
    if (prevDelta !== 0) {
      const op = prevDelta > 0 ? `+ ${prevDelta}` : `- ${-prevDelta}`;
      changes.push(`@line(>${lastAfter}, line => line ${op})`);
    }
    if (currentDelta !== 0) {
      lastAfter = afterLine;
    } else {
      lastAfter = 0;
    }
  }
  if (currentDelta !== 0 && lastAfter > 0) {
    const op = currentDelta > 0 ? `+ ${currentDelta}` : `- ${-currentDelta}`;
    changes.push(`@line(>${lastAfter}, line => line ${op})`);
  }

  return { content: currentContent, changed: changes.join("\n") };
}
