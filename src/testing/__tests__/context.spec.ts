import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext } from "../context.ts";

describe.skip("server.spec", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: any;

  beforeAll(async () => {
    ctx = await createContext();
    session = await ctx.createSession();
  }, 40_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("createSession ok", () => {
    expect(session.id).toBeTruthy();
  });

  it("1. 第一轮对话 — 问好", async () => {
    const resp = await ctx.promptText(session, "你好，我叫小明");
    expect(resp.info).toBeDefined();
    const texts = (resp.parts ?? []).filter((p: any) => p.type === "text");
    expect(texts.length).toBeGreaterThan(0);
  }, 60_000);

  it("2. 第二轮对话 — 上下文记忆", async () => {
    const resp = await ctx.promptText(session, "我叫什么名字？");
    const texts = (resp.parts ?? []).filter((p: any) => p.type === "text");
    const text = texts.map((t: any) => t.text).join("");
    expect(text).toMatch(/小明/);
  }, 60_000);

  it("3. 工具调用 — 读取文件", async () => {
    await ctx.promptText(session, "读取文件 package.json");
    const messages = await ctx.messages(session);
    const tools = messages.filter((m) =>
      m.parts.some((p) => p.type === "tool"),
    );

    console.log(tools);

    expect(tools.length, "应调用 read 工具").toBeGreaterThan(0);
  }, 60_000);
});
