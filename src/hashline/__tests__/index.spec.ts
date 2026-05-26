import { describe, it, expect } from "vitest";
import {
  computeLineHash,
  formatHashlineRegion,
  parseLineRef,
  formatFileAsHashline,
  stripHashline,
  applyEdits,
  formatHashlineStream,
  lines,
} from "../index.ts";

describe("computeLineHash", () => {
  it("相同内容产出一致哈希", () => {
    const a = computeLineHash(1, "const x = 1;");
    const b = computeLineHash(1, "const x = 1;");
    expect(a).toBe(b);
  });

  it("不同内容产出不同哈希", () => {
    const a = computeLineHash(1, "const x = 1;");
    const b = computeLineHash(1, "const x = 2;");
    expect(a).not.toBe(b);
  });

  it("哈希为2字符，来自字母表", () => {
    const h = computeLineHash(1, "hello");
    expect(h).toHaveLength(2);
    expect(h).toMatch(/^[ZPMQVRWSNKTXJBYH]{2}$/);
  });

  it("行末空白不影响哈希（trimEnd）", () => {
    const a = computeLineHash(1, "hello  ");
    const b = computeLineHash(1, "hello");
    expect(a).toBe(b);
  });

  it("\\r 被归一化", () => {
    const a = computeLineHash(1, "hello\r");
    const b = computeLineHash(1, "hello");
    expect(a).toBe(b);
  });

  it("纯符号行用行号作为种子", () => {
    const a = computeLineHash(3, "---");
    const b = computeLineHash(5, "---");
    expect(a).not.toBe(b); // 不同行号，种子不同
  });
});

describe("formatHashlineRegion", () => {
  it("格式化为 LINE#HASH:CONTENT", () => {
    const result = formatHashlineRegion(["const x = 1;", "const y = 2;"], 1);
    const lines = result.split("\n");
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:const x = 1;$/);
    expect(lines[1]).toMatch(/^2#[A-Z]{2}:const y = 2;$/);
  });

  it("行号对齐", () => {
    const result = formatHashlineRegion(["line"], 10);
    expect(result).toMatch(/^10#[A-Z]{2}:line$/);
  });

  it("空数组返回空字符串", () => {
    expect(formatHashlineRegion([], 1)).toBe("");
  });
});

describe("parseLineRef", () => {
  it("解析 LINE#HASH 格式", () => {
    const ref = parseLineRef("5#MQ");
    expect(ref.line).toBe(5);
    expect(ref.hash).toBe("MQ");
  });

  it("支持前导空白", () => {
    const ref = parseLineRef("  42#ZZ");
    expect(ref.line).toBe(42);
    expect(ref.hash).toBe("ZZ");
  });

  it("不接受行号外的字符前缀", () => {
    expect(() => parseLineRef("abc#ZZ")).toThrow(/E_BAD_REF/);
  });

  it("拒绝非2字符哈希", () => {
    expect(() => parseLineRef("1#ABC")).toThrow(/E_BAD_REF/);
  });
});

describe("formatFileAsHashline", () => {
  it("完整文件转为 hashline 格式", () => {
    const result = formatFileAsHashline("hello\nworld\n");
    const lines = result.split("\n");
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:hello$/);
    expect(lines[1]).toMatch(/^2#[A-Z]{2}:world$/);
  });

  it("无尾换行仍正确", () => {
    const result = formatFileAsHashline("hello\nworld");
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:hello$/);
  });
});

describe("stripHashline", () => {
  it("剥除 hashline 前缀", () => {
    expect(stripHashline(" 1#AB:hello")).toBe("hello");
    expect(stripHashline("10#CD:world")).toBe("world");
  });

  it("多行处理", () => {
    const input = " 1#AB:a\n 2#CD:b\n 3#EF:c";
    expect(stripHashline(input)).toBe("a\nb\nc");
  });
});

describe("applyEdits", () => {
  it("replace 单行替换", () => {
    const content = "line1\nline2\nline3\n";
    const anchor = "2#" + computeLineHash(2, "line2");
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "NEW2" },
    ]);
    expect(result.content).toBe("line1\nNEW2\nline3\n");
    expect(result.recovered).toBe(0);
  });

  it("replace 范围替换", () => {
    const content = "a\nb\nc\nd\ne\n";
    const start = "2#" + computeLineHash(2, "b");
    const end = "4#" + computeLineHash(4, "d");
    const result = applyEdits(content, [
      { op: "replace", pos: start, end, content: "X\nY" },
    ]);
    expect(result.content).toBe("a\nX\nY\ne\n");
  });

  it("append 在锚点后追加", () => {
    const content = "a\nb\nc\n";
    const anchor = "2#" + computeLineHash(2, "b");
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "b2" },
    ]);
    expect(result.content).toBe("a\nb\nb2\nc\n");
  });

  it("append 无锚点时追加到文件末尾", () => {
    const result = applyEdits("a\nb\n", [{ op: "append", content: "c" }]);
    expect(result.content).toBe("a\nb\nc\n");
  });

  it("prepend 在锚点前插入", () => {
    const content = "a\nb\nc\n";
    const anchor = "2#" + computeLineHash(2, "b");
    const result = applyEdits(content, [
      { op: "prepend", pos: anchor, content: "beforeB" },
    ]);
    expect(result.content).toBe("a\nbeforeB\nb\nc\n");
  });

  it("prepend 无锚点时插入到文件开头", () => {
    const result = applyEdits("a\nb\n", [{ op: "prepend", content: "header" }]);
    expect(result.content).toBe("header\na\nb\n");
  });

  it("delete 删除单行", () => {
    const content = "keep\nremove\nkeep\n";
    const anchor = "2#" + computeLineHash(2, "remove");
    const result = applyEdits(content, [{ op: "delete", pos: anchor }]);
    expect(result.content).toBe("keep\nkeep\n");
  });

  it("delete 范围删除", () => {
    const content = "a\nb\nc\nd\ne\n";
    const start = "2#" + computeLineHash(2, "b");
    const end = "4#" + computeLineHash(4, "d");
    const result = applyEdits(content, [{ op: "delete", pos: start, end }]);
    expect(result.content).toBe("a\ne\n");
  });

  it("多操作批量应用（从后往前）", () => {
    const content = "1\n2\n3\n4\n5\n";
    const a2 = "2#" + computeLineHash(2, "2");
    const a4 = "4#" + computeLineHash(4, "4");
    const result = applyEdits(content, [
      { op: "replace", pos: a2, content: "TWO" },
      { op: "delete", pos: a4 },
    ]);
    expect(result.content).toBe("1\nTWO\n3\n5\n");
  });

  it("锚点哈希不匹配 throw", () => {
    const content = "hello\n";
    expect(() =>
      applyEdits(content, [{ op: "replace", pos: "1#XX", content: "x" }]),
    ).toThrow(/E_NO_MATCH/);
  });

  it("锚点行号越界 throw", () => {
    const content = "hello\n";
    expect(() =>
      applyEdits(content, [{ op: "replace", pos: "99#XX", content: "x" }]),
    ).toThrow(/E_NO_MATCH/);
  });

  it("空文件 replace 报错", () => {
    expect(() =>
      applyEdits("", [{ op: "replace", pos: "1#XX", content: "x" }]),
    ).toThrow(/E_NO_MATCH/);
  });

  it("空文件 append 无锚点可创建内容", () => {
    const result = applyEdits("", [{ op: "append", content: "hello" }]);
    expect(result.content).toBe("hello");
  });

  it("空文件 prepend 无锚点可创建内容", () => {
    const result = applyEdits("", [{ op: "prepend", content: "hello" }]);
    expect(result.content).toBe("hello");
  });

  it("尾换行保持一致性", () => {
    // 原始有尾换行 → 结果也应有
    const r1 = applyEdits("a\nb\n", [
      { op: "delete", pos: "2#" + computeLineHash(2, "b") },
    ]);
    expect(r1.content).toBe("a\n");
    // 原始无尾换行 → 结果也应无
    const r2 = applyEdits("a\nb", [
      { op: "delete", pos: "2#" + computeLineHash(2, "b") },
    ]);
    expect(r2.content).toBe("a");
  });

  it("内容含字面 \\\\n 不被 split 误断", () => {
    const content = "col1\\ncol2\n";
    const anchor = "1#" + computeLineHash(1, "col1\\ncol2");
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "new" },
    ]);
    expect(result.content).toBe("new\n");
  });

  it("内容含字面 \\\\n 的多行替换", () => {
    const content = "a\\nb\nc\n";
    const anchor = "1#" + computeLineHash(1, "a\\nb");
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "X\\nY" },
    ]);
    expect(result.content).toBe("X\\nY\nc\n");
  });
});

describe("lines", () => {
  it("空字符串不产出行", () => {
    expect([...lines("")]).toEqual([]);
  });

  it("单行无换行不附带 \\n", () => {
    expect([...lines("hello")]).toEqual(["hello"]);
  });

  it("单行有换行附带 \\n", () => {
    expect([...lines("hello\n")]).toEqual(["hello\n"]);
  });

  it("多行保留每行 \\n", () => {
    expect([...lines("a\nb\nc\n")]).toEqual(["a\n", "b\n", "c\n"]);
  });

  it("字面 \\\\n 不被当作换行符", () => {
    expect([...lines("a\\nb\n")]).toEqual(["a\\nb\n"]);
  });

  it("精确重建用 join('')", () => {
    const input = "a\nb\nc\n";
    expect([...lines(input)].join("")).toBe(input);
  });
});

describe("formatHashlineStream", () => {
  async function* toAsyncIterable(lines: string[]): AsyncIterable<string> {
    for (const line of lines) yield line;
  }

  it("流式产出行号对齐的 hashline", async () => {
    const lines = toAsyncIterable(["hello", "world"]);
    const results: string[] = [];
    for await (const hl of formatHashlineStream(lines, 1)) {
      results.push(hl);
    }
    expect(results[0]).toMatch(/^1#[A-Z]{2}:hello$/);
    expect(results[1]).toMatch(/^2#[A-Z]{2}:world$/);
  });

  it("startLine 偏移正确", async () => {
    const lines = toAsyncIterable(["x"]);
    const results: string[] = [];
    for await (const hl of formatHashlineStream(lines, 42)) {
      results.push(hl);
    }
    expect(results[0]).toMatch(/^42#[A-Z]{2}:x$/);
  });

  it("空流不产生输出", async () => {
    const lines = toAsyncIterable([]);
    const results: string[] = [];
    for await (const hl of formatHashlineStream(lines, 1)) {
      results.push(hl);
    }
    expect(results).toEqual([]);
  });
});
