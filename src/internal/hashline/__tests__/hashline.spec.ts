import { describe, it, expect } from "vitest";
import { compute, hashedlines, lines, parseLineRef } from "../hashline.ts";

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

describe("#compute", () => {
  it("相同内容产出一致哈希", () => {
    const a = compute(1, "const x = 1;");
    const b = compute(1, "const x = 1;");
    expect(a).toBe(b);
  });

  it("不同内容产出不同哈希", () => {
    const a = compute(1, "const x = 1;");
    const b = compute(1, "const x = 2;");
    expect(a).not.toBe(b);
  });

  it("哈希为2字符，来自字母表", () => {
    const h = compute(1, "hello");
    expect(h).toHaveLength(2);
    expect(h).toMatch(/^[ZPMQVRWSNKTXJBYH]{2}$/);
  });

  it("行末空白不影响哈希（trimEnd）", () => {
    const a = compute(1, "hello  ");
    const b = compute(1, "hello");
    expect(a).toBe(b);
  });

  it("\\r 被归一化", () => {
    const a = compute(1, "hello\r");
    const b = compute(1, "hello");
    expect(a).toBe(b);
  });

  it("纯符号行用行号作为种子", () => {
    const a = compute(3, "---");
    const b = compute(5, "---");
    expect(a).not.toBe(b);
  });
});

describe("#lines", () => {
  const content = `
line1
line2 "\\n"
line3 \r
line4
`.trimStart();

  it("全部", () => {
    const ret = [...lines(content)].map(([l, c]) => `${l}:${c}`).join("");

    expect(ret).toContain("1:");
    expect(ret).toContain("4:");
  });

  it("指定开始", () => {
    const ret = [...lines(content, { start: 2 })]
      .map(([l, c]) => `${l}:${c}`)
      .join("");

    expect(ret).toContain("2:");
    expect(ret).toContain("5:");
  });

  it("指定范围", () => {
    const ret = [...lines(content, { offset: 2, limit: 2 })]
      .map(([l, c]) => `${l}:${c}`)
      .join("");

    expect(ret).toContain("2:");
    expect(ret).toContain("3:");
    expect(ret).not.toContain("1:");
    expect(ret).not.toContain("4:");
  });
});

describe("#hashedlines", () => {
  const content = `
line1
line2 "\\n"
line3 \r
line4
`.trimStart();

  it("全部", () => {
    const ret = [...hashedlines(content)].join("");

    expect(ret).toContain("1#");
    expect(ret).toContain("4#");
  });
});
