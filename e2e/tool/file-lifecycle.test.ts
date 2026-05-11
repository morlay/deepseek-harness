import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  toolsCalled,
} from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("file-lifecycle", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "file-lifecycle");
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("创建新文件", async () => {
    await ctx.promptText(
      session,
      `帮我写一个 hello.ts 文件，导出一个 hello 函数，返回字符串 "world"。`,
    );

    const content = await readFile(join(tmp.path, "hello.ts"), "utf-8");
    expect(content).toMatch(/hello/);
    expect(content).toMatch(/world/);
  }, 90_000);

  it("读取已有文件内容", async () => {
    await ctx.promptText(session, "hello.ts 里面现在有什么？");

    const messages = await ctx.messages(session);
    expect(toolsCalled(messages, "read")).toBeGreaterThan(0);
  }, 60_000);

  it("精确替换文本", async () => {
    await ctx.promptText(
      session,
      `hello.ts 里有一处 "world"，帮我改成 "open code"。`,
    );

    const content = await readFile(join(tmp.path, "hello.ts"), "utf-8");
    expect(content).toMatch(/open code/);
    expect(content).not.toMatch(/"world"/);
  }, 90_000);

  it("多行代码修改", async () => {
    await tmp.putFiles({
      "target.ts": `
const a = 1;
const b = 2;
const c = 3;
`.trim(),
    });

    await ctx.promptText(
      session,
      `target.ts 有三行 const 声明，中间那行是 const b = 2，帮我换成 const b = 42。`,
    );

    const content = await readFile(join(tmp.path, "target.ts"), "utf-8");
    expect(content).toContain("const b = 42");
    expect(content).not.toContain("const b = 2");
  }, 90_000);

  it("删除不需要的文件", async () => {
    await tmp.putFiles({
      "to-delete.ts": `export const legacy = true;`,
    });

    await ctx.promptText(session, "to-delete.ts 这个文件没用了，帮我删掉。");

    let exists = true;
    try {
      await readFile(join(tmp.path, "to-delete.ts"), "utf-8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  }, 90_000);

  it("从网络获取内容并保存为文件", async () => {
    await ctx.promptText(
      session,
      "获取 https://httpbin.org/json 的内容，保存为 httpbin.json",
    );

    const messages = await ctx.messages(session);
    expect(toolsCalled(messages, "webfetch")).toBeGreaterThan(0);

    const content = await readFile(join(tmp.path, "httpbin.json"), "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  }, 120_000);
});
