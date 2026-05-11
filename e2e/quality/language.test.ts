import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  reasoningText,
  assistantText,
  hasEnglishSentence,
} from "deepseek-harness/testing";
import type { Session } from "@opencode-ai/sdk/v2";

describe("language", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "language");
    await tmp.putFiles({
      "src/hello.ts": `export const greet = (name: string) => \`Hello \${name}\`;\n`,
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("thinking 中不含英文句子", async () => {
    await ctx.promptText(
      session,
      "src/hello.ts 里有什么内容？它的作用是什么？",
    );

    const messages = await ctx.messages(session);
    const reasoning = reasoningText(messages);

    expect(reasoning, "应包含 thinking 内容").toBeTruthy();
    expect(hasEnglishSentence(reasoning), "thinking 中不应包含英文句段").toBe(
      false,
    );
  }, 90_000);

  it("assistant 文本回复使用中文", async () => {
    await ctx.promptText(
      session,
      "帮我在 src/ 目录下创建一个 goodbye.ts 文件，导出一个 goodbye 函数，返回字符串 'bye'",
    );

    const messages = await ctx.messages(session);
    const reply = assistantText(messages);

    expect(reply, "应包含 assistant 文本回复").toBeTruthy();
    // assistant 回复应包含中文内容
    expect(reply).toMatch(/[\u4e00-\u9fff]{2,}/);
  }, 90_000);
});
