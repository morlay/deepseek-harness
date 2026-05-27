import { describe, it, expect } from "vitest";
import {
  computeLineHash,
  parseLineRef,
  formatFileAsHashline,
  applyEdits,
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

  it("支持 diff 风格前缀", () => {
    const ref = parseLineRef("+  7#AB");
    expect(ref.line).toBe(7);
    expect(ref.hash).toBe("AB");
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
    const result = formatFileAsHashline(`hello
world
`);
    const lines = result.split("\n");
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:hello$/);
    expect(lines[1]).toMatch(/^2#[A-Z]{2}:world$/);
  });

  it("无尾换行仍正确", () => {
    const result = formatFileAsHashline(`hello
world`);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:hello$/);
  });

  it("跳过纯空行但保留物理行号", () => {
    const result = formatFileAsHashline(`hello

world
`);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:hello$/);
    expect(lines[1]).toMatch(/^3#[A-Z]{2}:world$/);
    expect(result).not.toMatch(/^2#/m);
  });

  it("CRLF 纯空行同样跳过且不输出回车符", () => {
    const result = formatFileAsHashline("hello\r\n\r\nworld\r\n");
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^1#[A-Z]{2}:hello$/);
    expect(lines[1]).toMatch(/^3#[A-Z]{2}:world$/);
    expect(result).not.toContain("\r");
  });

  it("只跳过真正空行，不跳过空白字符行", () => {
    const result = formatFileAsHashline("hello\n  \nworld\n");
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^2#[A-Z]{2}:  $/);
  });
});

describe("applyEdits", () => {
  it("replace 单行替换", () => {
    const content = `line1
line2
line3
`;
    const anchor = "2#" + computeLineHash(2, "line2");
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "NEW2" },
    ]);
    expect(result.content).toBe("line1\nNEW2\nline3\n");
    expect(result.changed.split("\n")).toEqual([
      `-2#${computeLineHash(2, "line2")}`,
      `+2#${computeLineHash(2, "NEW2")}`,
    ]);
  });

  it("replace 范围替换", () => {
    const content = `a
b
c
d
e
`;
    const start = "2#" + computeLineHash(2, "b");
    const end = "4#" + computeLineHash(4, "d");
    const result = applyEdits(content, [
      { op: "replace", pos: start, end, content: "X\nY" },
    ]);
    expect(result.content).toBe("a\nX\nY\ne\n");
  });

  it("append 在锚点后追加", () => {
    const content = `a
b
c
`;
    const anchor = "2#" + computeLineHash(2, "b");
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "b2" },
    ]);
    expect(result.content).toBe("a\nb\nb2\nc\n");
  });

  it("同一锚点多次 prepend/append 保持顺序", () => {
    const content = `core
`;
    const anchor = `1#${computeLineHash(1, "core")}`;
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "after1" },
      { op: "append", pos: anchor, content: "after2" },
      { op: "prepend", pos: anchor, content: "before1" },
      { op: "prepend", pos: anchor, content: "before2" },
    ]);
    expect(result.content).toBe("before1\nbefore2\ncore\nafter1\nafter2\n");
  });

  it("append 无锚点时追加到文件末尾", () => {
    const result = applyEdits(
      `a
b
`,
      [{ op: "append", content: "c" }],
    );
    expect(result.content).toBe("a\nb\nc\n");
  });

  it("prepend 在锚点前插入", () => {
    const content = `a
b
c
`;
    const anchor = "2#" + computeLineHash(2, "b");
    const result = applyEdits(content, [
      { op: "prepend", pos: anchor, content: "beforeB" },
    ]);
    expect(result.content).toBe("a\nbeforeB\nb\nc\n");
  });

  it("delete 删除单行", () => {
    const content = `keep
remove
keep
`;
    const anchor = "2#" + computeLineHash(2, "remove");
    const result = applyEdits(content, [{ op: "delete", pos: anchor }]);
    expect(result.content).toBe("keep\nkeep\n");
  });

  it("delete 范围删除", () => {
    const content = `a
b
c
d
e
`;
    const start = "2#" + computeLineHash(2, "b");
    const end = "4#" + computeLineHash(4, "d");
    const result = applyEdits(content, [{ op: "delete", pos: start, end }]);
    expect(result.content).toBe("a\ne\n");
  });

  it("多操作批量应用（从后往前）", () => {
    const content = `1
2
3
4
5
`;
    const a2 = "2#" + computeLineHash(2, "2");
    const a4 = "4#" + computeLineHash(4, "4");
    const result = applyEdits(content, [
      { op: "replace", pos: a2, content: "TWO" },
      { op: "delete", pos: a4 },
    ]);
    expect(result.content).toBe("1\nTWO\n3\n5\n");
  });

  it("锚点哈希不匹配 throw", () => {
    const content = `hello
`;
    expect(() =>
      applyEdits(content, [{ op: "replace", pos: "1#XX", content: "x" }]),
    ).toThrow(/E_NO_MATCH/);
  });

  it("锚点行号越界 throw", () => {
    const content = `hello
`;
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

  it("尾换行保持一致性", () => {
    // 原始有尾换行 → 结果也应有
    const r1 = applyEdits(
      `a
b
`,
      [{ op: "delete", pos: "2#" + computeLineHash(2, "b") }],
    );
    expect(r1.content).toBe(`a
`);
    // 原始无尾换行 → 结果也应无
    const r2 = applyEdits(
      `a
b`,
      [{ op: "delete", pos: "2#" + computeLineHash(2, "b") }],
    );
    expect(r2.content).toBe("a");
  });

  it("内容含字面 \\\\n 不被 split 误断", () => {
    const content = `col1\\ncol2
`;
    const anchor = "1#" + computeLineHash(1, "col1\\ncol2");
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "new" },
    ]);
    expect(result.content).toBe("new\n");
  });

  it("内容含字面 \\\\n 的多行替换", () => {
    const content = `a\\nb
c
`;
    const anchor = "1#" + computeLineHash(1, "a\\nb");
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "X\\nY" },
    ]);
    expect(result.content).toBe("X\\nY\nc\n");
  });

  it("返回 changed: replace 产生 -/+ 行", () => {
    const content = `a
b
`;
    const anchor = `2#${computeLineHash(2, "b")}`;
    const result = applyEdits(content, [
      { op: "replace", pos: anchor, content: "c" },
    ]);
    expect(result.changed.split("\n")).toEqual([
      `-2#${computeLineHash(2, "b")}`,
      `+2#${computeLineHash(2, "c")}`,
    ]);
  });

  it("返回 changed: delete 产生 - 行", () => {
    const content = `a
b
c
`;
    const anchor = `2#${computeLineHash(2, "b")}`;
    const result = applyEdits(content, [{ op: "delete", pos: anchor }]);
    expect(result.changed.split("\n")).toEqual([
      `-2#${computeLineHash(2, "b")}`,
      "@line(>2, line => line - 1)",
    ]);
  });

  it("返回 changed: append 产生 + 行", () => {
    const content = `a
b
`;
    const anchor = `2#${computeLineHash(2, "b")}`;
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "c" },
    ]);
    expect(result.changed.split("\n")).toEqual([
      `+3#${computeLineHash(3, "c")}`,
      "@line(>2, line => line + 1)",
    ]);
  });

  it("返回 changed 时跳过纯空行", () => {
    const content = `a

b
`;
    const start = `1#${computeLineHash(1, "a")}`;
    const end = `3#${computeLineHash(3, "b")}`;
    const result = applyEdits(content, [{ op: "delete", pos: start, end }]);
    expect(result.changed.split("\n")).toEqual([
      `-1#${computeLineHash(1, "a")}`,
      `-3#${computeLineHash(3, "b")}`,
      "@line(>3, line => line - 3)",
    ]);
    expect(result.changed).not.toMatch(/^-2#/m);
  });
});
