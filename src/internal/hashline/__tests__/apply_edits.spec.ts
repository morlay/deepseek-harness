import { describe, it, expect } from "vitest";
import { applyEdits } from "../apply_edits.ts";

import { lineRef } from "../hashline.ts";

describe("applyEdits", () => {
  it("delete + append 实现单行替换", () => {
    const content = `line1
line2
line3
`;
    const a1 = lineRef(1, "line1");
    const a2 = lineRef(2, "line2");

    const result = applyEdits(content, [
      { op: "delete", pos: a2 },
      { op: "append", pos: a1, content: "NEW2" },
    ]);

    expect(result.content).toBe("line1\nNEW2\nline3\n");
    expect(result.changed.split("\n")).toEqual([
      `-${lineRef(2, "line2")}`,
      `+${lineRef(2, "NEW2")}`,
    ]);
  });

  it("delete + append 实现范围替换", () => {
    const content = `a
b
c
d
e
`;
    const a1 = lineRef(1, "a");
    const a2 = lineRef(2, "b");
    const a4 = lineRef(4, "d");
    const result = applyEdits(content, [
      { op: "delete", pos: a2, end: a4 },
      { op: "append", pos: a1, content: "X\nY" },
    ]);
    expect(result.content).toBe("a\nX\nY\ne\n");
  });

  it("append 在锚点后追加", () => {
    const content = `a
b
c
`;
    const anchor = lineRef(2, "b");
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "b2" },
    ]);
    expect(result.content).toBe("a\nb\nb2\nc\n");
  });

  it("同一锚点多次 prepend/append 保持顺序", () => {
    const content = `core
`;
    const anchor = lineRef(1, "core");
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "after1" },
      { op: "append", pos: anchor, content: "after2" },
      { op: "prepend", pos: anchor, content: "before1" },
      { op: "prepend", pos: anchor, content: "before2" },
    ]);
    expect(result.content).toBe("before1\nbefore2\ncore\nafter1\nafter2\n");
  });

  it("append-eof 追加到文件末尾", () => {
    const result = applyEdits(
      `a
b
`,
      [{ op: "append-eof", content: "c" }],
    );
    expect(result.content).toBe("a\nb\nc\n");
  });

  it("prepend 在锚点前插入", () => {
    const content = `a
b
c
`;
    const anchor = lineRef(2, "b");
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
    const anchor = lineRef(2, "remove");
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
    const start = lineRef(2, "b");
    const end = lineRef(4, "d");
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
    const a1 = lineRef(1, "1");
    const a2 = lineRef(2, "2");
    const a4 = lineRef(4, "4");
    const result = applyEdits(content, [
      { op: "delete", pos: a2 },
      { op: "append", pos: a1, content: "TWO" },
      { op: "delete", pos: a4 },
    ]);
    expect(result.content).toBe("1\nTWO\n3\n5\n");
  });

  it("锚点哈希不匹配 throw", () => {
    const content = `hello
`;
    expect(() => applyEdits(content, [{ op: "delete", pos: "1#XX" }])).toThrow(
      /E_NO_MATCH/,
    );
  });

  it("锚点行号越界 throw", () => {
    const content = `hello
`;
    expect(() => applyEdits(content, [{ op: "delete", pos: "99#XX" }])).toThrow(
      /E_NO_MATCH/,
    );
  });

  it("空文件 delete 报错", () => {
    expect(() => applyEdits("", [{ op: "delete", pos: "1#XX" }])).toThrow(
      /E_NO_MATCH/,
    );
  });

  it("空文件 append-eof 可创建内容", () => {
    const result = applyEdits("", [{ op: "append-eof", content: "hello" }]);
    expect(result.content).toBe("hello");
  });

  it("尾换行保持一致性", () => {
    const r1 = applyEdits(
      `a
b
`,
      [{ op: "delete", pos: lineRef(2, "b") }],
    );
    expect(r1.content).toBe(`a
`);

    const r2 = applyEdits(
      `a
b`,
      [{ op: "delete", pos: lineRef(2, "b") }],
    );
    expect(r2.content).toBe("a");
  });

  it("内容含字面 \\n 不被 split 误断 (delete+append)", () => {
    const content = `col1\\ncol2
`;
    const anchor = lineRef(1, "col1\\ncol2");
    const result = applyEdits(content, [{ op: "delete", pos: anchor }]);
    expect(result.content).toBe("");
  });

  it("内容含字面 \\n 的多行替换 (delete+append)", () => {
    const content = `a\\nb
c
`;
    const anchor = lineRef(1, "a\\nb");
    const result = applyEdits(content, [
      { op: "delete", pos: anchor },
      { op: "append-eof", content: "X\\nY" },
    ]);
    expect(result.content).toBe("c\nX\\nY\n");
  });

  it("返回 changed: delete+append 产生 -/+ 行", () => {
    const content = `a
b
`;
    const a1 = lineRef(1, "a");
    const a2 = lineRef(2, "b");
    const result = applyEdits(content, [
      { op: "delete", pos: a2 },
      { op: "append", pos: a1, content: "c" },
    ]);
    expect(result.changed.split("\n")).toEqual([
      `-${lineRef(2, "b")}`,
      `+${lineRef(2, "c")}`,
    ]);
  });

  it("返回 changed: delete 产生 - 行", () => {
    const content = `a
b
c
`;
    const anchor = lineRef(2, "b");
    const result = applyEdits(content, [{ op: "delete", pos: anchor }]);
    expect(result.changed.split("\n")).toEqual([
      `-${lineRef(2, "b")}`,
      "@line(>2, line => line - 1)",
    ]);
  });

  it("返回 changed: append 产生 + 行", () => {
    const content = `a
b
`;
    const anchor = lineRef(2, "b");
    const result = applyEdits(content, [
      { op: "append", pos: anchor, content: "c" },
    ]);
    expect(result.changed.split("\n")).toEqual([
      `+${lineRef(3, "c")}`,
      "@line(>2, line => line + 1)",
    ]);
  });

  it("返回 changed 时跳过纯空行", () => {
    const content = `a

b
`;
    const start = lineRef(1, "a");
    const end = lineRef(3, "b");
    const result = applyEdits(content, [{ op: "delete", pos: start, end }]);
    expect(result.changed.split("\n")).toEqual([
      `-${lineRef(1, "a")}`,
      `-${lineRef(3, "b")}`,
      "@line(>3, line => line - 3)",
    ]);
    expect(result.changed).not.toMatch(/^-2#/m);
  });
});
