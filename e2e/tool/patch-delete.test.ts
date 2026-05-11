import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("patch-delete", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "patch-delete");
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("通过自然语言删除文件", async () => {
    await tmp.putFiles({
      "legacy.ts": `export const deprecated = true;`,
    });

    await ctx.promptText(session, "legacy.ts 没用了，帮我删掉");

    let exists = true;
    try {
      await readFile(join(tmp.path, "legacy.ts"), "utf-8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  }, 90_000);
});
