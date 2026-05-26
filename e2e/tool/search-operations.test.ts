import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  toolsCalled,
} from "deepseek-harness/testing";
import type { Session } from "@opencode-ai/sdk/v2";

describe("search-operations", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "search-ops");
    await tmp.putFiles({
      "src/utils.ts": `
export const add = (a, b) => a + b
export const subtract = (a, b) => a - b
`.trim(),
      "src/app.ts": `
import { add, subtract } from "./utils";

const result = add(1, 2);
console.log(subtract(5, 3));
`.trim(),
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("按文件名模式查找文件 — glob", async () => {
    await ctx.promptText(session, "src/ 目录下有哪些 .ts 类型的文件？");

    const messages = await ctx.messages(session);
    expect(toolsCalled(messages, "glob")).toBeGreaterThan(0);
    await ctx.logStats();
  }, 90_000);

  it("按文本内容搜索 — hashgrep / astgrep", async () => {
    await ctx.promptText(
      session,
      "在 src/ 里找一下，哪些文件里出现了 export 这个关键字？",
    );

    const messages = await ctx.messages(session);
    expect(
      toolsCalled(messages, "hashgrep") +
        toolsCalled(messages, "astgrep") +
        toolsCalled(messages, "glob") +
        toolsCalled(messages, "bash"),
      "应使用搜索工具",
    ).toBeGreaterThan(0);
    await ctx.logStats();
  }, 90_000);

  it("代码重构——重命名函数并更新所有引用", async () => {
    await ctx.promptText(
      session,
      "subtract 这个名字不太好，帮我改成 minus，src/ 里用到的地方全部改掉。",
    );

    const utils = await tmp.readFile("src/utils.ts");
    const app = await tmp.readFile("src/app.ts");

    expect(utils).toContain("minus");
    expect(utils).not.toContain("subtract");
    expect(app).toContain("minus");
    expect(app).not.toContain("subtract");
    await ctx.logStats();
  }, 90_000);
});
