import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("path-params", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "path-params");
    await tmp.putFiles({
      "src/lib/math.ts": `export const PI = 3.1415926;`,
      "src/lib/strings.ts": `export const greet = (name: string) => \`Hello \${name}\`;`,
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("读取嵌套目录下的文件", async () => {
    await ctx.promptText(session, "读取 src/lib/math.ts，PI 具体值是多少？");

    // 验证文件未被修改
    const content = await readFile(join(tmp.path, "src/lib/math.ts"), "utf-8");
    expect(content).toContain("3.1415926");
    await ctx.logStats();
  }, 90_000);

  it("创建文件到嵌套子目录", async () => {
    await ctx.promptText(
      session,
      "在 src/lib/ 下创建 types.ts，导出一个 type Info = { name: string }",
    );

    const content = await readFile(join(tmp.path, "src/lib/types.ts"), "utf-8");
    expect(content).toMatch(/Info/);
    await ctx.logStats();
  }, 90_000);

  it("在子目录中搜索", async () => {
    await ctx.promptText(session, "在 src/lib/ 中搜索 export 关键字");

    // 验证文件未被修改
    const content = await readFile(
      join(tmp.path, "src/lib/strings.ts"),
      "utf-8",
    );
    expect(content).toContain("export");
    await ctx.logStats();
  }, 90_000);

  it("修改嵌套子目录中的文件", async () => {
    await ctx.promptText(session, "src/lib/math.ts 的 PI 值改成 3.14159");

    const content = await readFile(join(tmp.path, "src/lib/math.ts"), "utf-8");
    expect(content).toMatch(/3\.14159/);
    await ctx.logStats();
  }, 90_000);
});
