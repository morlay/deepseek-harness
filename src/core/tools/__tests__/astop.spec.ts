import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { astgrep } from "../astgrep.ts";
import { astedit } from "../astedit.ts";
import type { ToolContext as TC } from "@opencode-ai/plugin/tool";

async function setupDir() {
  const dir = await mkdtemp(join(tmpdir(), "dh-astop-"));
  const pf = async (rel: string, content: string) => {
    const p = join(dir, rel);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, content, "utf-8");
  };
  const rf = (rel: string) => readFile(join(dir, rel), "utf-8");
  const ctx = {
    directory: dir,
    worktree: dir,
    sessionID: "",
    messageID: "",
    agent: "",
    abort: new AbortController().signal,
  } as TC;
  return { ctx, pf, rf };
}

describe("astgrep 结构化搜索", () => {
  it("查找所有导出常量定义", async () => {
    const { ctx, pf } = await setupDir();
    await pf(
      "src/math.ts",
      "export const PI = 3.14;\nexport const E = 2.718;\n",
    );
    await pf(
      "src/strings.ts",
      "export const greet = (name: string) => `Hello ${name}`;\n",
    );

    const result = await astgrep().execute(
      { pattern: "export const $NAME = $VALUE", lang: "typescript" },
      ctx,
    );
    const output = typeof result === "string" ? result : result.output;

    expect(output).toMatch(/PI/);
    expect(output).toMatch(/E/);
    expect(output).toMatch(/greet/);
  });

  it("无匹配结果", async () => {
    const { ctx, pf } = await setupDir();
    await pf("src/x.ts", "import foo from 'bar';");
    const result = await astgrep().execute(
      { pattern: "class $NAME {}", lang: "typescript" },
      ctx,
    );
    const output = typeof result === "string" ? result : result.output;
    expect(output).toMatch(/no match/i);
  });
});

describe("astedit 结构化改写", () => {
  it("dryRun 预览 → 确认后改写：搜索 const 声明并替换", async () => {
    const { ctx, pf, rf } = await setupDir();
    await pf("src/target.ts", "const x = 1;\nconst y = 2;\n");

    // 1. dryRun 预览
    const preview = await astedit().execute(
      {
        pattern: "const $NAME = $VALUE",
        rewrite: "let $NAME = $VALUE",
        lang: "typescript",
        dryRun: true,
      },
      ctx,
    );
    const previewOut = typeof preview === "string" ? preview : preview.output;
    expect(previewOut).toMatch(/\n-/);
    expect(previewOut).toMatch(/\n\+/);

    // 2. 确认执行 — 用 pattern 搜索并直接文本替换
    await astedit().execute(
      {
        pattern: "const x = 1",
        rewrite: "let x = 1",
        lang: "typescript",
        dryRun: false,
      },
      ctx,
    );
    await astedit().execute(
      {
        pattern: "const y = 2",
        rewrite: "let y = 2",
        lang: "typescript",
        dryRun: false,
      },
      ctx,
    );

    const content = await rf("src/target.ts");
    expect(content).toContain("let x = 1");
    expect(content).toContain("let y = 2");
  });
});
