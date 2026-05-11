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

  it("grep — 正则格式搜索多个关键词", async () => {
    await ctx.promptText(
      session,
      "在 src/ 目录中，搜索同时包含 export 和 const 的行，告诉我有哪些文件匹配。用适合的工具，一次到位。",
    );

    const messages = await ctx.messages(session);
    // grep 不支持 lookahead，LLM 可能选择 rg 替代
    expect(
      toolsCalled(messages, "grep") + toolsCalled(messages, "bash"),
      "应使用 grep 或 bash rg 搜索",
    ).toBeGreaterThan(0);

    const inputs = toolInput(messages, "grep");
    // 如果用了 grep，验证参数；如果用了 rg，参数在 bash command 中不做深入验证
    if (inputs.length > 0) {
      for (const args of inputs) {
        expect(args.pattern).toBeTruthy();
        if (args.path) expect(args.path).not.toMatch(ABS_PATH);
      }
    }
  }, 90_000);

  it("sg — AST pattern 搜索代码结构", async () => {
    await ctx.promptText(
      session,
      "在 src/ 中用 sg 找所有 export const 声明，pattern 用 AST 匹配模式",
    );

    const messages = await ctx.messages(session);
    expect(toolsCalled(messages, "sg")).toBeGreaterThan(0);

    const inputs = toolInput(messages, "sg");
    expect(inputs.length).toBeGreaterThan(0);
    for (const args of inputs) {
      expect(args.pattern).toBeTruthy();
      if (args.path) expect(args.path).not.toMatch(ABS_PATH);
    }
  }, 90_000);

  it("sg — 搜索结果验证（正确匹配 export const）", async () => {
    await ctx.promptText(
      session,
      "src/ 中 export const 定义了什么常量？用 sg 搜索",
    );

    const messages = await ctx.messages(session);
    const inputs = toolInput(messages, "sg");
    expect(inputs.length).toBeGreaterThan(0);

    for (const args of inputs) {
      expect(args.pattern, "sg pattern 必填").toBeTruthy();
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
