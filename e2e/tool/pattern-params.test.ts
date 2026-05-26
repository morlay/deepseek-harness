import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("pattern-params", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "pattern-params");
    await tmp.putFiles({
      "src/math.ts": `
export const PI = 3.14;
export const E = 2.718;
`.trim(),
      "src/strings.ts": `
export const greet = (name: string) => \`Hello \${name}\`;
`.trim(),
      "src/app.ts": `
import { PI } from "./math";
console.log(PI);
`.trim(),
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("hashgrep 正则搜索", async () => {
    await ctx.promptText(session, "在 src/ 目录中搜索 export 关键字");

    // 验证文件未被意外修改
    const content = await readFile(join(tmp.path, "src/math.ts"), "utf-8");
    expect(content).toContain("export const PI");
    await ctx.logStats();
  }, 90_000);

  it("astgrep AST 搜索", async () => {
    await ctx.promptText(
      session,
      "用 astgrep 在 src/ 中找所有 export const 声明",
    );

    const content = await readFile(join(tmp.path, "src/strings.ts"), "utf-8");
    expect(content).toContain("export const greet");
    await ctx.logStats();
  }, 90_000);

  it("glob 通配符搜索", async () => {
    await ctx.promptText(session, "用 glob 列出 src/ 下所有 .ts 文件");

    const content = await readFile(join(tmp.path, "src/app.ts"), "utf-8");
    expect(content).toContain("PI");
    await ctx.logStats();
  }, 90_000);
});
