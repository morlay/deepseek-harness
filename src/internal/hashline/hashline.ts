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

export function compute(lineNumber: number, line: string): string {
  line = line.trimEnd();
  if (line.includes("\r")) line = line.replaceAll("\r", "");
  let seed = 0;
  if (!RE_SIGNIFICANT.test(line)) {
    seed = lineNumber;
  }
  return DICT[hash32(line, seed) & 0xff]!;
}

export function* lines(
  content: string,
  opt: { offset?: number; limit?: number; start?: number } = {},
): Iterable<[number, string]> {
  let start = 0;

  let lineNumber = opt.start ?? 1;
  let lineOffset = opt.offset ?? 1;

  while (start < content.length) {
    const end = content.indexOf("\n", start);
    if (end === -1) {
      if (lineNumber >= lineOffset) {
        yield [lineNumber, content.slice(start)];
      }
      break;
    }

    if (lineNumber >= lineOffset) {
      yield [lineNumber, content.slice(start, end + 1)];
    }

    start = end + 1;
    lineNumber++;

    if (opt.limit) {
      if (lineNumber >= lineOffset + opt.limit) {
        break;
      }
    }
  }
}

export function* hashedlines(
  content: string,
  opt: {
    start?: number;
    limit?: number;
    prefix?: (c: string) => [string | null, number | null, string];
  } = {},
): Iterable<string> {
  const start = opt.start ?? 1;

  for (const [lineNumber, c] of lines(content, { start: opt.start })) {
    if (lineNumber < start) {
      yield c;
      continue;
    }

    if (opt.limit) {
      if (lineNumber >= start + opt.limit) {
        yield c;
        continue;
      }
    }

    if (opt.prefix) {
      const [prefix, l, cc] = opt.prefix(c);

      if (l) {
        yield `${prefix}${l}#${compute(l, cc)}:${cc}`;
        continue;
      }
    }

    yield `${lineNumber}#${compute(lineNumber, c)}:${c}`;
  }
}

export function lineRef(lineNumber: number, line: string) {
  return `${lineNumber}#${compute(lineNumber, line)}`;
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
