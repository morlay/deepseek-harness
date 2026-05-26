import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  toolsCalled,
} from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("astop e2e — AST 结构化编辑闭环", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "astop-e2e");
    await tmp.putFiles({
      "src/math.ts": `
export const PI = 3.14
export const E = 2.718
`.trim(),
      "src/strings.ts": `
export const greet = (name: string) => \`Hello \${name}\`
`.trim(),
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("astgrep 搜索所有导出常量", async () => {
    await ctx.promptText(
      session,
      "用 astgrep 搜一下 src/ 下所有 `export const $NAME = $VALUE`，告诉我有哪些。",
    );

    const messages = await ctx.messages(session);
    expect(toolsCalled(messages, "astgrep")).toBeGreaterThan(0);
    await ctx.logStats();
  }, 90_000);

  it("astedit dryRun 预览后执行 const → let 重构", async () => {
    await ctx.promptText(
      session,
      "src/math.ts 里的 const 声明改成 let，先用 astedit dryRun 看看要改什么，确认后再执行。",
    );

    const content = await readFile(join(tmp.path, "src/math.ts"), "utf-8");
    expect(content).toContain("let PI");
    expect(content).toContain("let E");
    expect(content).not.toMatch(/const PI/);
    expect(content).not.toMatch(/const E/);
    await ctx.logStats();
  }, 120_000);
});
