import { compute, parseLineRef } from "./hashline";

export type Pos = string;

export type EditOp =
  | {
      op: "append";
      pos: Pos;
      content: string;
    }
  | {
      op: "prepend";
      pos: Pos;
      content: string;
    }
  | {
      op: "delete";
      pos: Pos;
      end?: Pos;
    }
  | {
      op: "append-eof";
      content: string;
    };

type Changed = string;

export interface EditResult {
  content: string;
  changed: Changed;
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
  | { op: "delete"; order: number; start: number; end: number }
  | { op: "append"; order: number; index: number; content: string }
  | { op: "prepend"; order: number; index: number; content: string }
  | { op: "append-eof"; order: number; content: string };

type RangeEdit = Extract<PreparedEdit, { op: "delete" }>;

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
      hash: compute(lineNumber, text),
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
  return `${prefix}${lineNumber}#${compute(lineNumber, text)}`;
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
    const endRef = edit.op === "delete" ? edit.end : undefined;
    throw new Error(
      `[E_BAD_RANGE] 结束锚点 "${endRef}" 不能早于起始锚点 "${"pos" in edit ? edit.pos : "?"}"`,
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
  if (edit.op === "append-eof") {
    return { op: "append-eof", order, content: edit.content };
  }
  if (!("pos" in edit) || !edit.pos) {
    throw new Error(`[E_BAD_REF] ${(edit as any).op}.pos 不能为空`);
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
  throw new Error(`[E_BAD_OP] 不支持的操作`);
}

function isRangeEdit(edit: PreparedEdit): edit is RangeEdit {
  return edit.op === "delete";
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
    if (
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

  let currentDelta = 0;
  let lastAfter = 0;
  for (const edit of prepared) {
    let delta = 0;
    let afterLine = 0;
    if (edit.op === "delete") {
      delta = -(edit.end - edit.start + 1);
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
    if (prevDelta !== 0 && currentDelta !== 0) {
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

  changes.sort((a, b) => {
    const pa = a.charCodeAt(0) === 64 ? 2 : a.charCodeAt(0) === 43 ? 1 : 0;
    const pb = b.charCodeAt(0) === 64 ? 2 : b.charCodeAt(0) === 43 ? 1 : 0;
    return pa - pb;
  });

  return { content: currentContent, changed: changes.join("\n") };
}
