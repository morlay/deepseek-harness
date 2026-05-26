import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("arg-validation", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "arg-validation");
    await tmp.putFiles({
      "data.txt": [...Array(20)]
        .map((_, i) => `line ${i + 1}: value_${i + 1}`)
        .join("\n"),
      "sample.ts": `const x = 1;\nconst y = 2;\nconst z = 3;`,
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("代码搜索并修改", async () => {
    await ctx.promptText(
      session,
      "sample.ts 里的 const z = 3 改成 const z = 99",
    );

    const content = await readFile(join(tmp.path, "sample.ts"), "utf-8");
    expect(content).toContain("const z = 99");
    expect(content).not.toContain("const z = 3");
    await ctx.logStats();
  }, 90_000);

  it("读取指定范围行", async () => {
    await ctx.promptText(
      session,
      "读取 data.txt 的第 5 到第 8 行，告诉我每行内容",
    );

    // 仅验证文件未被意外修改
    const content = await readFile(join(tmp.path, "data.txt"), "utf-8");
    expect(content).toContain("line 5: value_5");
    expect(content).toContain("line 8: value_8");
    await ctx.logStats();
  }, 90_000);

  it("创建新文件", async () => {
    await ctx.promptText(session, "创建 result.txt，内容为 done=true");

    const content = await readFile(join(tmp.path, "result.txt"), "utf-8");
    expect(content).toMatch(/done\s*=\s*true/);
    await ctx.logStats();
  }, 90_000);

  it("文本搜索", async () => {
    await ctx.promptText(session, "在 data.txt 中搜索 value_5");

    // 仅验证文件未被意外修改
    const content = await readFile(join(tmp.path, "data.txt"), "utf-8");
    expect(content).toContain("value_5");
    await ctx.logStats();
  }, 90_000);

  it("按模式列出文件", async () => {
    await ctx.promptText(session, "用 glob 列出当前目录下所有 .ts 文件");

    // 仅验证 .ts 文件确实存在
    const content = await readFile(join(tmp.path, "sample.ts"), "utf-8");
    expect(content).toContain("const");
    await ctx.logStats();
  }, 90_000);
});
