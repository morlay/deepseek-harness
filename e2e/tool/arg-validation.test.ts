import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  toolInput,
  ABS_PATH,
} from "deepseek-harness/testing";
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
      "sample.ts": `
const x = 1;
const y = 2;
const z = 3;
`.trim(),
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("sg — 必填参数 pattern 已传递", async () => {
    await ctx.promptText(
      session,
      "用 sg 在 sample.ts 中搜索 const 声明，pattern 使用 AST 模式",
    );

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "sg");
    expect(args.length).toBeGreaterThan(0);
    for (const a of args) {
      expect(a.pattern, "sg pattern 必填").toBeTruthy();
    }
  }, 90_000);

  it("patch — 必填参数 calls 数组已传递", async () => {
    await ctx.promptText(
      session,
      "把 sample.ts 里的 const z = 3 改成 const z = 99",
    );

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "patch");
    if (args.length > 0) {
      for (const a of args) {
        expect(a.calls, "calls 参数必填").toBeTruthy();
        expect(a.calls.length, "calls 至少包含一个操作").toBeGreaterThan(0);
      }
    }
  }, 90_000);

  it("read — offset 和 limit 使用正整数", async () => {
    await ctx.promptText(session, "读取 data.txt 的第 5 到第 8 行内容");

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "read");
    expect(args.length).toBeGreaterThan(0);

    const last = args[args.length - 1];
    if (last.offset !== undefined) {
      expect(last.offset, "offset 应为正整数").toBeGreaterThanOrEqual(1);
    }
    if (last.limit !== undefined) {
      expect(last.limit, "limit 应为非负整数").toBeGreaterThanOrEqual(0);
    }
  }, 90_000);

  it("write — filePath 和 content 都已传递", async () => {
    await ctx.promptText(session, "创建 result.txt，内容为 done=true");

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "write");
    expect(args.length).toBeGreaterThan(0);

    for (const a of args) {
      expect(a.filePath, "filePath 必填").toBeTruthy();
      expect(a.filePath).not.toMatch(ABS_PATH);
      expect(a.content !== undefined, "content 必填").toBe(true);
    }
  }, 90_000);
});
