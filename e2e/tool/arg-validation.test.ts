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
      "sample.ts": `const x = 1;\nconst y = 2;\nconst z = 3;`,
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  function anyToolCalled(messages: any[], ...names: string[]): boolean {
    return names.some((n) => toolInput(messages, n).length > 0);
  }

  it("astgrep / hashgrep — 搜索 const 声明时 pattern 必填", async () => {
    await ctx.promptText(session, "在 sample.ts 中搜索 const 声明");

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "astgrep").concat(
      toolInput(messages, "hashgrep"),
    );
    expect(args.length, "应使用搜索工具").toBeGreaterThan(0);

    for (const a of args) {
      expect(a.pattern, "pattern 必填").toBeTruthy();
    }
  }, 90_000);

  it("修改代码 — 使用 hashedit / astedit / write", async () => {
    await ctx.promptText(
      session,
      "把 sample.ts 里的 const z = 3 改成 const z = 99",
    );

    const messages = await ctx.messages(session);
    expect(
      anyToolCalled(messages, "hashedit", "astedit", "write"),
      "应使用编辑工具完成修改",
    ).toBe(true);
  }, 90_000);

  it("hashread — offset 和 limit 使用正整数", async () => {
    await ctx.promptText(
      session,
      "读取 data.txt 的第 5 到第 8 行，每行内容是什么？",
    );

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "hashread");
    // LLM may use hashgrep instead — both are valid
    if (args.length === 0) return;

    const last = args[args.length - 1];
    if (last.offset !== undefined) {
      expect(last.offset, "offset 应为正整数").toBeGreaterThanOrEqual(1);
    }
    if (last.limit !== undefined) {
      expect(last.limit, "limit 应为非负整数").toBeGreaterThanOrEqual(0);
    }
  }, 90_000);

  it("write / hashedit — filePath 和 content 都已传递", async () => {
    await ctx.promptText(session, "创建 result.txt，内容为 done=true");

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "write").concat(
      toolInput(messages, "hashedit"),
    );
    expect(args.length).toBeGreaterThan(0);

    for (const a of args) {
      expect(a.filePath, "filePath 必填").toBeTruthy();
      expect(a.filePath).not.toMatch(ABS_PATH);
      expect(a.content !== undefined, "content 必填").toBe(true);
    }
  }, 90_000);

  it("hashgrep — 必填 pattern 已传递", async () => {
    await ctx.promptText(session, "在 data.txt 中搜索 value_5");

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "hashgrep");
    expect(args.length).toBeGreaterThan(0);
    for (const a of args) {
      expect(a.pattern, "hashgrep pattern 必填").toBeTruthy();
    }
  }, 90_000);

  it("glob — 必填 pattern 已传递", async () => {
    await ctx.promptText(session, "用 glob 列出当前目录下所有 .ts 文件");

    const messages = await ctx.messages(session);
    const args = toolInput(messages, "glob");
    expect(args.length).toBeGreaterThan(0);
    for (const a of args) {
      expect(a.pattern, "glob pattern 必填").toBeTruthy();
    }
  }, 90_000);
});
