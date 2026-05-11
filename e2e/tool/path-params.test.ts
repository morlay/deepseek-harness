import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createContext,
  createTempDir,
  toolInput,
  ABS_PATH,
} from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("path-params", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "path-params");
    await tmp.putFiles({
      "src/lib/math.ts": `export const PI = 3.1415926;`,
      "src/lib/strings.ts": `export const greet = (name: string) => \`Hello \${name}\`;`,
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  function anyInput(messages: any[], ...names: string[]) {
    return names.flatMap((n) => toolInput(messages, n));
  }

  it("读取嵌套目录下的文件 — 使用 hashread / hashgrep", async () => {
    await ctx.promptText(
      session,
      "读取 src/lib/math.ts 的内容，PI 的具体值是多少？",
    );

    const messages = await ctx.messages(session);
    const inputs = anyInput(messages, "hashread", "hashgrep");
    expect(inputs.length, "应调用读取工具").toBeGreaterThan(0);

    for (const args of inputs) {
      const fp = args.filePath ?? args.path;
      expect(fp).toBeTruthy();
      expect(fp).not.toMatch(ABS_PATH);
    }
  }, 90_000);

  it("write — 创建文件到嵌套子目录", async () => {
    await ctx.promptText(
      session,
      "在 src/lib/ 下创建一个 types.ts 文件，导出一个 type Info = { name: string }",
    );

    const content = await readFile(join(tmp.path, "src/lib/types.ts"), "utf-8");
    expect(content).toMatch(/Info/);

    const messages = await ctx.messages(session);
    const inputs = toolInput(messages, "write").concat(
      toolInput(messages, "hashedit"),
    );
    expect(inputs.length).toBeGreaterThan(0);
    for (const args of inputs) {
      expect(args.filePath).toBeTruthy();
      expect(args.filePath).not.toMatch(ABS_PATH);
    }
  }, 90_000);

  it("在子目录中搜索 — 使用 hashgrep / astgrep", async () => {
    await ctx.promptText(
      session,
      "在 src/lib/ 目录中搜索 export 关键字，告诉我哪些文件里有",
    );

    const messages = await ctx.messages(session);
    const inputs = anyInput(messages, "hashgrep", "astgrep");
    expect(inputs.length, "应调用搜索工具").toBeGreaterThan(0);

    for (const args of inputs) {
      expect(args.pattern).toBeTruthy();
      const fp = args.filePath ?? args.path;
      if (fp) expect(fp).not.toMatch(ABS_PATH);
    }
  }, 90_000);

  it("修改嵌套子目录中的文件", async () => {
    await ctx.promptText(
      session,
      "把 src/lib/math.ts 里的 PI 值从 3.14 改成 3.14159",
    );

    const content = await readFile(join(tmp.path, "src/lib/math.ts"), "utf-8");
    expect(content).toMatch(/3\.14159/);
  }, 90_000);
});
