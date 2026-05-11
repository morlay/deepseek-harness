import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("patch-rename", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "patch-rename");
    await tmp.putFiles({
      "utils/old-helper.ts": `export const OLD = "deprecated";\n`,
    });
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("通过 patch rename 重命名文件", async () => {
    await ctx.promptText(
      session,
      "把 utils/old-helper.ts 重命名为 utils/helper.ts",
    );

    // 原文件应不存在
    await expect(
      readFile(join(tmp.path, "utils/old-helper.ts"), "utf-8"),
    ).rejects.toThrow();

    // 新文件应存在且内容正确
    const content = await readFile(join(tmp.path, "utils/helper.ts"), "utf-8");
    expect(content).toContain("OLD");
  }, 90_000);

  it("通过 patch rename 移动文件到子目录", async () => {
    await tmp.putFiles({
      "root.ts": `export const ROOT = true;\n`,
    });

    await ctx.promptText(session, "把 root.ts 移动到 utils/root.ts");

    // 原文件应不存在
    await expect(
      readFile(join(tmp.path, "root.ts"), "utf-8"),
    ).rejects.toThrow();

    // 新文件应存在
    const content = await readFile(join(tmp.path, "utils/root.ts"), "utf-8");
    expect(content).toContain("ROOT");
  }, 90_000);
});
