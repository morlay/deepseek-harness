import { describe, it, expect } from "vitest";
import { writeFile, readFile, mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { grepAsHashline } from "../riggrep.ts";
import {
  formatFileAsHashline,
  applyEdits,
  computeLineHash,
  type EditOp,
} from "../hashline.ts";

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  const lines: string[] = [];
  for await (const line of gen) lines.push(line);
  return lines.join("\n");
}

async function setupTmp() {
  const dir = await mkdtemp(join(tmpdir(), "dh-hashcon-"));
  const write = async (rel: string, content: string) => {
    const p = join(dir, rel);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, content, "utf-8");
  };
  const read = (rel: string) => readFile(join(dir, rel), "utf-8");
  return { dir, write, read };
}

function extractHash(hashed: string, lineNum: number): string {
  for (const ln of hashed.split("\n")) {
    const m = ln.match(new RegExp(`^${lineNum}#([A-Z]{2}):`));
    if (m) return m[1]!;
  }
  throw new Error(`Line ${lineNum} not found in hashline output`);
}

describe("hash 一致性", () => {
  it("read 和 grep 对同一行返回相同 hash", async () => {
    const { write, read, dir } = await setupTmp();
    await write(
      "src/app.ts",
      `export const add = (a, b) => a + b;
export const sub = (a, b) => a - b;
`,
    );
    const content = await read("src/app.ts");
    const readHashed = formatFileAsHashline(content);
    const grepHashed = await collect(grepAsHashline("sub", dir));
    const readHash = extractHash(readHashed, 2);
    const grepHash = extractHash(grepHashed, 2);
    expect(grepHash).toBe(readHash);
  });

  it("edit 后未修改行 hash 不变，且与 grep 一致", async () => {
    const { write, read, dir } = await setupTmp();
    await write(
      "src/app.ts",
      `export const add = (a, b) => a + b;
export const sub = (a, b) => a - b;
`,
    );
    const beforeContent = await read("src/app.ts");
    const beforeHashed = formatFileAsHashline(beforeContent);
    const line1Before = extractHash(beforeHashed, 1);
    const line2Before = extractHash(beforeHashed, 2);
    const oldStr = "export const sub = (a, b) => a - b;";
    const anchor = `2#${computeLineHash(2, oldStr)}`;
    const editResult = applyEdits(beforeContent, [
      {
        op: "replace",
        pos: anchor,
        oldStr,
        newStr: "export const minus = (a, b) => a - b;",
      },
    ]);
    expect(editResult.changed).toContain("-2#");
    await write("src/app.ts", editResult.content);
    const afterContent = await read("src/app.ts");
    const afterHashed = formatFileAsHashline(afterContent);
    const line1After = extractHash(afterHashed, 1);
    const line2After = extractHash(afterHashed, 2);
    expect(line1After).toBe(line1Before);
    expect(line2After).not.toBe(line2Before);
    const grepHashed = await collect(grepAsHashline("minus", dir));
    const grepHash = extractHash(grepHashed, 2);
    expect(grepHash).toBe(line2After);
  });

  it("跳过空行时非空行 hash 不受编辑影响", async () => {
    const { write, read } = await setupTmp();
    await write(
      "a.txt",
      `header

body

footer
`,
    );
    const beforeContent = await read("a.txt");
    const beforeHashed = formatFileAsHashline(beforeContent);
    const line1Before = extractHash(beforeHashed, 1);
    const line5Before = extractHash(beforeHashed, 5);
    expect(beforeHashed).not.toMatch(/^2#/m);
    expect(beforeHashed).not.toMatch(/^4#/m);
    const anchor = `3#${computeLineHash(3, "body")}`;
    const editResult = applyEdits(beforeContent, [
      { op: "replace", pos: anchor, oldStr: "body", newStr: "modified" },
    ]);
    expect(editResult.changed).toContain("-3#");
    await write("a.txt", editResult.content);
    const afterContent = await read("a.txt");
    const afterHashed = formatFileAsHashline(afterContent);
    expect(extractHash(afterHashed, 1)).toBe(line1Before);
    expect(extractHash(afterHashed, 5)).toBe(line5Before);
    expect(afterHashed).not.toMatch(/^2#/m);
    expect(afterHashed).not.toMatch(/^4#/m);
  });

  it("批量编辑后所有未修改行 hash 不变", async () => {
    const { write, read } = await setupTmp();
    await write(
      "src/lib/math.ts",
      `export const PI = 3.14;
export const E = 2.718;
`,
    );
    const beforeContent = await read("src/lib/math.ts");
    const beforeHashed = formatFileAsHashline(beforeContent);
    const anchor1 = `1#${computeLineHash(1, "export const PI = 3.14;")}`;
    const anchor2 = `2#${computeLineHash(2, "export const E = 2.718;")}`;
    const edits: EditOp[] = [
      {
        op: "replace",
        pos: anchor1,
        oldStr: "export const PI = 3.14;",
        newStr: "export const PI = 3.14159;",
      },
      {
        op: "replace",
        pos: anchor2,
        oldStr: "export const E = 2.718;",
        newStr: "export const E = 2.71828;",
      },
    ];
    const editResult = applyEdits(beforeContent, edits);
    expect(editResult.changed).toContain("-1#");
    await write("src/lib/math.ts", editResult.content);
    const afterContent = await read("src/lib/math.ts");
    const afterHashed = formatFileAsHashline(afterContent);
    expect(extractHash(afterHashed, 1)).not.toBe(extractHash(beforeHashed, 1));
    expect(extractHash(afterHashed, 2)).not.toBe(extractHash(beforeHashed, 2));
  });

  // ── grepAsHashline 直接验证 ──
  it("文件路径 grep 返回 hashline 格式", async () => {
    const { write, dir } = await setupTmp();
    await write(
      "a.ts",
      `const x = 1;
const y = 2;
`,
    );
    const p = join(dir, "a.ts");
    const lines: string[] = [];
    for await (const l of grepAsHashline("const", p)) lines.push(l);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^.*a\.ts\n\d+#[A-Z]{2}:const x = 1;/);
  });

  it("文件路径 grep 正确处理内容里的冒号", async () => {
    const { write, dir } = await setupTmp();
    await write(
      "colon.txt",
      `2:value
plain
`,
    );
    const p = join(dir, "colon.txt");
    const lines: string[] = [];
    for await (const l of grepAsHashline("value", p)) lines.push(l);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("\n1#");
    expect(lines[0]).toContain(":2:value");
  });

  it("目录路径 grep 返回 hashline 格式", async () => {
    const { write, dir } = await setupTmp();
    await write(
      "b.ts",
      `export const a = 1;
`,
    );
    const lines: string[] = [];
    for await (const l of grepAsHashline("export", dir)) lines.push(l);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^.*b\.ts\n\d+#[A-Z]{2}:export const a = 1;$/);
  });

  it("无匹配时返回空", async () => {
    const { write, dir } = await setupTmp();
    await write(
      "c.ts",
      `const z = 3;
`,
    );
    const lines: string[] = [];
    for await (const l of grepAsHashline("nonexistent", dir)) lines.push(l);
    expect(lines.length).toBe(0);
  });

  it("include glob 过滤", async () => {
    const { write, dir } = await setupTmp();
    await write(
      "src/d.ts",
      `const d = 4;
`,
    );
    await write(
      "src/e.txt",
      `const e = 5;
`,
    );
    const lines: string[] = [];
    for await (const l of grepAsHashline("const", dir, "*.ts")) lines.push(l);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("d.ts");
  });

  it("grep 匹配纯空行时不输出空锚点", async () => {
    const { write, dir } = await setupTmp();
    await write(
      "blank.txt",
      `alpha

beta
`,
    );
    const lines: string[] = [];
    for await (const l of grepAsHashline("^$", dir)) lines.push(l);
    expect(lines).toEqual([]);
  });

  it("grep 匹配 CRLF 纯空行时不输出空锚点", async () => {
    const { write, dir } = await setupTmp();
    await write("blank-crlf.txt", "alpha\r\n\r\nbeta\r\n");
    const lines: string[] = [];
    for await (const l of grepAsHashline("^$", dir)) lines.push(l);
    expect(lines).toEqual([]);
  });
});
