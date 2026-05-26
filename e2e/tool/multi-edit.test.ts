import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("multi-edit — 多轮连续编辑锚点更新", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "multi-edit");
    await tmp.putFiles({
      "config.ts": `
const host = 'localhost'
const port = 3000
const debug = true
`.trim(),
      "pkg.json": `
{
  "name": "app",
  "version": "1.0.0",
  "author": "alice",
  "license": "MIT",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "oxlint"
  }
}
`.trim(),
      "readme.md": `
# Project

## Getting Started

Install dependencies:

    npm install

## Usage

Run the app:

    npm start

## License

MIT
`.trim(),
      "lines.ts": `
const a = 1
const b = 2
const c = 3
const d = 4
const e = 5
`.trim(),
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("同位置连续修改 — 锚点随内容变化", async () => {
    // 第一轮：修改 host，产生新锚点
    await ctx.promptText(session, "config.ts 的 host 值改成 '0.0.0.0'");
    void ctx.logStats();

    // 第二轮：再次修改 host，必须用第一轮返回的新锚点
    await ctx.promptText(
      session,
      "把 config.ts 里刚才改的那行的 host 值改成 '127.0.0.1'",
    );

    const content = await readFile(join(tmp.path, "config.ts"), "utf-8");
    expect(content).toContain("'127.0.0.1'");
    expect(content).not.toContain("'0.0.0.0'");
    expect(content).not.toContain("'localhost'");
    void ctx.logStats();
  }, 120_000);

  it("两行同时修改后 — 从变更清单挑锚点再改一行", async () => {
    // 第一轮：同时改 host 和 port，hashedit 返回两个新锚点
    await ctx.promptText(
      session,
      "config.ts 的 host 改成 '0.0.0.0'，port 改成 8080",
    );
    void ctx.logStats();

    // 第二轮：再改 host，LLM 应从变更清单 +1#XX +2#YY 中挑出 host 的 1#XX
    await ctx.promptText(
      session,
      "把 config.ts 里 host 的值再改成 '127.0.0.1'",
    );

    const content = await readFile(join(tmp.path, "config.ts"), "utf-8");
    expect(content).toContain("'127.0.0.1'");
    expect(content).toContain("8080");
    expect(content).not.toContain("'localhost'");
    void ctx.logStats();
  }, 120_000);

  it("改 A 行后再改 B 行 — B 锚点未过期直接复用", async () => {
    // 第一轮：改 host（第 1 行），port（第 2 行）锚点不变
    await ctx.promptText(session, "config.ts 的 host 值改成 '0.0.0.0'");
    void ctx.logStats();

    // 第二轮：改 port，port 的锚点没因 host 修改而变，LLM 应直接拿来用
    await ctx.promptText(session, "再把 config.ts 的 port 改成 9090");

    const content = await readFile(join(tmp.path, "config.ts"), "utf-8");
    expect(content).toContain("'0.0.0.0'");
    expect(content).toContain("9090");
    void ctx.logStats();
  }, 120_000);

  it("大文件中散布编辑 — 插入导致行号大幅偏移", async () => {
    // 第一轮：改 version
    await ctx.promptText(session, 'pkg.json 的 version 改成 "2.0.0"');
    void ctx.logStats();

    // 第二轮：在 author 后面插入一行（后续所有行号后移）
    await ctx.promptText(
      session,
      '在 pkg.json 的 author 后面加一行 "description": "test app"',
    );
    void ctx.logStats();

    // 第三轮：修改 lint 脚本（原在第 11 行，已偏移到第 12 行，锚点过期）
    await ctx.promptText(session, "pkg.json 的 lint 脚本改成 oxlint --fix");

    const content = await readFile(join(tmp.path, "pkg.json"), "utf-8");
    expect(content).toContain('"2.0.0"');
    expect(content).toContain('"test app"');
    expect(content).toContain("oxlint --fix");
    void ctx.logStats();
  }, 180_000);

  it("删除后再插入 — 混合操作下多轮编辑", async () => {
    // 第一轮：删除 Getting Started 整段
    await ctx.promptText(
      session,
      "删除 readme.md 里 ## Getting Started 整个段落，包括它下面的两行",
    );
    void ctx.logStats();

    // 第二轮：在 Usage 和 License 之间插入新段落
    await ctx.promptText(
      session,
      "在 readme.md 的 ## License 前面加一段 ## Contributing\n\nSee CONTRIBUTING.md",
    );
    void ctx.logStats();

    // 第三轮：修改 License 内容
    await ctx.promptText(
      session,
      "把 readme.md 的 License 那行改成 Apache-2.0",
    );

    const content = await readFile(join(tmp.path, "readme.md"), "utf-8");
    expect(content).not.toContain("Getting Started");
    expect(content).toContain("## Contributing");
    expect(content).toContain("Apache-2.0");
    void ctx.logStats();
  }, 180_000);

  it("全量读取后多轮编辑 — 复用已有锚点不重读", async () => {
    // 第一轮：让 LLM 先查看 pkg.json 全貌，拿到所有锚点
    await ctx.promptText(
      session,
      "pkg.json 里定义了哪些字段？告诉我所有字段名",
    );
    void ctx.logStats();

    // 第二轮：改 version（锚点在第一轮 returned 里）
    await ctx.promptText(
      session,
      'pkg.json 的 version 改成 "3.0.0"',
    );
    void ctx.logStats();

    // 第三轮：改 author（锚点在第一轮 returned 里）
    await ctx.promptText(
      session,
      'pkg.json 的 author 改成 "bob"',
    );
    void ctx.logStats();

    // 第四轮：改 license（锚点仍在第一轮 returned 里）
    await ctx.promptText(
      session,
      'pkg.json 的 license 改成 "Apache-2.0"',
    );

    const content = await readFile(join(tmp.path, "pkg.json"), "utf-8");
    expect(content).toContain('"3.0.0"');
    expect(content).toContain('"bob"');
    expect(content).toContain('"Apache-2.0"');
    void ctx.logStats();
  }, 180_000);

  it("同一行反复改中间夹删除 — 锚点过期后重搜", async () => {
    // 第一轮：改 c（第 3 行）
    await ctx.promptText(
      session,
      "lines.ts 的 const c = 3 改成 const c = 30",
    );
    void ctx.logStats();

    // 第二轮：删除 b（第 2 行），c 从第 3 行 → 第 2 行，旧锚点 3#XX 过期
    await ctx.promptText(
      session,
      "删除 lines.ts 里 const b = 2 这一行",
    );
    void ctx.logStats();

    // 第三轮：再改 c（旧锚点已过期，必须重搜或复用第二轮返回的变更清单）
    await ctx.promptText(
      session,
      "把 lines.ts 的 c 值改成 const c = 300",
    );

    const content = await readFile(join(tmp.path, "lines.ts"), "utf-8");
    expect(content).toContain("const c = 300");
    expect(content).not.toContain("const b");
    void ctx.logStats();
  }, 180_000);
});
