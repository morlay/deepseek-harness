import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { computeLineHash } from "./hashline.ts";

interface RipgrepLine {
  file: string;
  lineNumber: number;
  text: string;
}

function normalizeMatchText(text: string): string {
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

async function isFilePath(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function parseLineNumber(text: string, start: number): [number, number] | null {
  let end = start;
  while (end < text.length && isAsciiDigit(text.charCodeAt(end))) end++;
  if (end === start || text.charCodeAt(end) !== 58) return null;
  return [Number.parseInt(text.slice(start, end), 10), end + 1];
}

function parseSingleFileLine(line: string, file: string): RipgrepLine | null {
  const parsed = parseLineNumber(line, 0);
  if (!parsed) return null;
  const [lineNumber, textStart] = parsed;
  return {
    file,
    lineNumber,
    text: normalizeMatchText(line.slice(textStart)),
  };
}

function parsePathLine(line: string): RipgrepLine | null {
  let fileEnd = line.indexOf(":");
  while (fileEnd > 0) {
    const parsed = parseLineNumber(line, fileEnd + 1);
    if (parsed) {
      const [lineNumber, textStart] = parsed;
      return {
        file: line.slice(0, fileEnd),
        lineNumber,
        text: normalizeMatchText(line.slice(textStart)),
      };
    }
    fileEnd = line.indexOf(":", fileEnd + 1);
  }
  return null;
}

/** 用 ripgrep 搜索文件内容，按文件拆分 hashline 输出 */
export async function* grepAsHashline(
  pattern: string,
  dir: string,
  include?: string,
): AsyncGenerator<string> {
  const singleFile = await isFilePath(dir);
  const argv = ["--line-number", "--no-heading", "--color", "never"];
  if (include) argv.push("--glob", include);
  argv.push("--", pattern, dir);
  const proc = spawn("rg", argv, { stdio: ["ignore", "pipe", "ignore"] });
  const rl = createInterface({ input: proc.stdout! });
  let currentFile = "";
  let currentLines: string[] = [];
  for await (const line of rl) {
    const parsed = singleFile
      ? parseSingleFileLine(line, dir)
      : parsePathLine(line);
    if (!parsed || parsed.text.length === 0) continue;
    if (parsed.file !== currentFile) {
      if (currentFile) yield currentLines.join("\n");
      currentFile = parsed.file;
      currentLines = [parsed.file];
    }
    currentLines.push(
      `${parsed.lineNumber}#${computeLineHash(parsed.lineNumber, parsed.text)}:${parsed.text}`,
    );
  }
  if (currentFile) yield currentLines.join("\n");
}
