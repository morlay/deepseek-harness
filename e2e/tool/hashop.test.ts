import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("hashop e2e — hashline 编辑闭环", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "hashop-e2e");
    await tmp.putFiles({
      "src/utils.ts": `
export const add = (a, b) => a + b
export const subtract = (a, b) => a - b
`.trim(),
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("grep 搜索 → read 确认 → edit 替换", async () => {
    await ctx.promptText(
      session,
      "subtract 这个名字不好，帮我改成 minus，其他不要动。",
    );

    const content = await readFile(join(tmp.path, "src/utils.ts"), "utf-8");
    expect(content).toContain("minus");
    expect(content).not.toContain("subtract");
    await ctx.logStats();
  }, 90_000);

  it("hashedit 多文件批量编辑", async () => {
    await tmp.putFiles({
      "config/a.ts": `const host = 'localhost'\nconst port = 3000\n`,
      "config/b.ts": `const host = 'localhost'\nconst debug = true\n`,
    });

    await ctx.promptText(
      session,
      "config/ 目录下两个文件里的 host 都改成 '0.0.0.0'。",
    );

    for (const f of ["config/a.ts", "config/b.ts"]) {
      const content = await readFile(join(tmp.path, f), "utf-8");
      expect(content).toContain("0.0.0.0");
      expect(content).not.toContain("localhost");
    }
    await ctx.logStats();
  }, 120_000);

  it("hashedit 创建新文件", async () => {
    await ctx.promptText(
      session,
      "新建 docs/readme.md，内容只有一行 '# Hello'。",
    );

    const content = await readFile(join(tmp.path, "docs/readme.md"), "utf-8");
    expect(content).toMatch(/Hello/);
    await ctx.logStats();
  }, 90_000);
});
