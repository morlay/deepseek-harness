import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, type Context } from "deepseek-harness/testingutil";
import { workingDir, type WorkingDir } from "deepseek-harness/testingutil";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

describe("e2e: ast 工具链", () => {
  let wd: WorkingDir;
  let ctx: Context;
  const toolStats: Record<string, number> = {};

  beforeAll(async () => {
    wd = await workingDir("e2e-ast-tools");
    ctx = await createContext({ cwd: wd.root });

    ctx.session.subscribe((evt: AgentSessionEvent) => {
      if (evt.type === "tool_execution_start") {
        toolStats[evt.toolName] = (toolStats[evt.toolName] ?? 0) + 1;
      }
      const skip = new Set(["message_update"]);
      if (!skip.has(evt.type)) {
        const extra =
          evt.type === "tool_execution_start"
            ? evt.toolName
            : evt.type === "agent_end"
              ? `msgs:${evt.messages.length}`
              : "";
        console.log(`  [${evt.type}] ${extra}`);
      }
    });
  }, 60_000);

  afterAll(async () => {
    console.log("[stats] tools:", JSON.stringify(toolStats));
    ctx.session.dispose();
    await wd.cleanup();
  });

  it("astgrep 搜索 const 声明", async () => {
    await wd.putFiles({
      "src/app.ts": "const port = 3000\nconst host = 'localhost'\n",
    });

    await ctx.session.prompt("用 astgrep 搜索 src 目录下所有 const 声明");
  }, 120_000);

  it("astedit 将 const 改为 let", async () => {
    await wd.putFiles({
      "lib/config.ts": "const port = 3000\nconst host = 'localhost'\n",
    });

    await ctx.session.prompt(
      "用 astedit 把 lib/config.ts 中所有 const 改为 let",
    );

    const content = await readFile(resolve(wd.root, "lib/config.ts"), "utf-8");
    expect(content).toContain("let port = 3000");
    expect(content).toContain("let host = 'localhost'");
    expect(content).not.toMatch(/^const /m);
  }, 180_000);

  it("astgrep then astedit: 搜索后改写", async () => {
    await wd.putFiles({
      "utils/math.ts":
        "function add(a: number, b: number): number { return a + b }\nfunction sub(a: number, b: number): number { return a - b }\n",
    });

    await ctx.session.prompt(
      "先用 astgrep 搜索 utils 下所有函数声明，然后用 astedit 给每个函数添加 export 前缀",
    );

    const content = await readFile(resolve(wd.root, "utils/math.ts"), "utf-8");
    expect(content).toContain("export function add");
    expect(content).toContain("export function sub");
    expect(content).not.toMatch(/^function /m);
  }, 180_000);

  it("astgrep 搜索 import 语句", async () => {
    await wd.putFiles({
      "ui/Button.tsx":
        "import React from 'react'\nimport { clsx } from 'clsx'\nexport const Button = () => <button />\n",
    });

    await ctx.session.prompt("用 astgrep 搜索 ui 目录下所有 import 语句");
  }, 60_000);
});
