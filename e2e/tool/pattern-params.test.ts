import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  toolsCalled,
  toolInput,
  ABS_PATH,
} from "deepseek-harness/testing";
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

  it("hashgrep — 正则搜索 export const", async () => {
    await ctx.promptText(
      session,
      "在 src/ 目录中，搜索同时包含 export 和 const 的行，告诉我有哪些文件匹配。",
    );

    const messages = await ctx.messages(session);
    expect(
      toolsCalled(messages, "hashgrep") +
        toolsCalled(messages, "astgrep") +
        toolsCalled(messages, "glob") +
        toolsCalled(messages, "bash"),
      "应使用搜索工具",
    ).toBeGreaterThan(0);

    const inputs = toolInput(messages, "hashgrep");
    if (inputs.length > 0) {
      for (const args of inputs) {
        expect(args.pattern).toBeTruthy();
        if (args.path) expect(args.path).not.toMatch(ABS_PATH);
      }
    }
  }, 90_000);

  it("astgrep — AST pattern 搜索 export const 声明", async () => {
    await ctx.promptText(
      session,
      "在 src/ 中用 astgrep 找所有 export const 声明，pattern 用 AST 匹配模式",
    );

    const messages = await ctx.messages(session);
    expect(
      toolsCalled(messages, "astgrep") + toolsCalled(messages, "hashgrep"),
      "应使用 astgrep 或 hashgrep 搜索",
    ).toBeGreaterThan(0);

    const inputs = toolInput(messages, "astgrep");
    if (inputs.length > 0) {
      for (const args of inputs) {
        expect(args.pattern).toBeTruthy();
        if (args.path) expect(args.path).not.toMatch(ABS_PATH);
      }
    }
  }, 90_000);

  it("astgrep — 搜索结果验证 pattern 含 const/export", async () => {
    await ctx.promptText(
      session,
      "src/ 中 export const 定义了什么常量？用 astgrep 搜索",
    );

    const messages = await ctx.messages(session);
    const inputs = toolInput(messages, "astgrep");
    // LLM may choose hashgrep instead — both valid
    if (inputs.length === 0) return;

    for (const args of inputs) {
      expect(args.pattern, "astgrep pattern 必填").toBeTruthy();
      expect(args.pattern).toMatch(/\$|const|export/);
      if (args.path) expect(args.path).not.toMatch(ABS_PATH);
    }
  }, 90_000);

  it("glob — 通配符搜索文件", async () => {
    await ctx.promptText(
      session,
      "用 glob 列出 src/ 下所有 .ts 文件，告诉我有哪些",
    );

    const messages = await ctx.messages(session);
    const inputs = toolInput(messages, "glob");
    expect(inputs.length).toBeGreaterThan(0);

    for (const args of inputs) {
      expect(args.pattern).toBeTruthy();
      expect(args.pattern).toContain("*");
      if (args.path) expect(args.path).not.toMatch(ABS_PATH);
    }
  }, 90_000);
});
