import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, type Context } from "deepseek-harness/testingutil";
import { workingDir, type WorkingDir } from "deepseek-harness/testingutil";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

describe("e2e: edit 工具链", () => {
  let wd: WorkingDir;
  let ctx: Context;
  const toolStats: Record<string, number> = {};

  beforeAll(async () => {
    wd = await workingDir("e2e-edit-tools");
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

  it("read then edit: 读取文件并用 oldText/newText 精确替换", async () => {
    await wd.putFiles({ "items.txt": "apple\nbanana\ncherry\ndate\n" });
    await ctx.session.prompt("读取 items.txt，把 banana 替换为 orange");
    const content = await readFile(resolve(wd.root, "items.txt"), "utf-8");
    expect(content).toContain("apple");
    expect(content).toContain("orange");
    expect(content).toContain("cherry");
    expect(content).toContain("date");
    expect(content).not.toContain("banana");
  }, 180_000);

  it("grep then edit: 搜索后用 edit 精确修改匹配内容", async () => {
    await wd.putFiles({
      "src/a.ts": "const port = 3000;\nconst host = 'localhost';\n",
      "src/b.ts": "const port = 8080;\nconst debug = true;\n",
    });
    await ctx.session.prompt(
      "搜索 src 下包含 port 的行，把端口号改为 9999",
    );
    const a = await readFile(resolve(wd.root, "src/a.ts"), "utf-8");
    const b = await readFile(resolve(wd.root, "src/b.ts"), "utf-8");
    expect(a).toContain("9999");
    expect(a).not.toContain("3000");
    expect(b).toContain("9999");
    expect(b).not.toContain("8080");
  }, 240_000);

  it("write 创建新文件", async () => {
    await ctx.session.prompt("write 创建 greeting.txt，内容 hello 和 world 两行");
    const content = await readFile(resolve(wd.root, "greeting.txt"), "utf-8");
    expect(content).toMatch(/hello/);
    expect(content).toMatch(/world/);
  }, 120_000);

  it("read then edit: oldText/newText 组合修改 JSON", async () => {
    await wd.putFiles({
      "config.json": [
        "{",
        '  "name": "my-app",',
        '  "version": "1.0.0"',
        "}",
        "",
      ].join("\n"),
    });
    await ctx.session.prompt(
      "读取 config.json，用 edit 在 name 行后插入 debug 行，在 version 行前插入 author 行",
    );
    const content = await readFile(resolve(wd.root, "config.json"), "utf-8");
    expect(content).toContain("debug");
    expect(content).toContain("author");
  }, 240_000);

  it("move 重命名和删除文件", async () => {
    await wd.putFiles({
      "tmp/old-name.ts": "export const x = 1;\n",
      "tmp/to-delete.ts": "// will be removed\n",
    });
    await ctx.session.prompt(
      "move 将 tmp/old-name.ts 重命名为 tmp/new-name.ts，用 /dev/null 删除 tmp/to-delete.ts",
    );
    const newContent = await readFile(
      resolve(wd.root, "tmp/new-name.ts"),
      "utf-8",
    );
    expect(newContent).toContain("export const x = 1");
    await expect(access(resolve(wd.root, "tmp/old-name.ts"))).rejects.toThrow();
    await expect(
      access(resolve(wd.root, "tmp/to-delete.ts")),
    ).rejects.toThrow();
  }, 180_000);

  it("astgrep then astedit: AST 模式搜索并替换", async () => {
    await wd.putFiles({
      "src/app.ts": "const port = 3000\nconst host = 'localhost'\n",
    });

    await ctx.session.prompt(
      "用 astgrep 搜索 src 下所有 const 声明，然后用 astedit 把每个 const 改为 let",
    );

    const content = await readFile(resolve(wd.root, "src/app.ts"), "utf-8");
    expect(content).toContain("let port = 3000");
    expect(content).toContain("let host = 'localhost'");
    expect(content).not.toContain("const port");
  }, 180_000);

  it("astedit 直接改写函数声明", async () => {
    await wd.putFiles({
      "lib/math.ts":
        "function add(a: number, b: number): number { return a + b }\nfunction sub(a: number, b: number): number { return a - b }\n",
    });

    await ctx.session.prompt(
      "用 astedit 把 lib/math.ts 中所有函数声明改为 export function",
    );

    const content = await readFile(resolve(wd.root, "lib/math.ts"), "utf-8");
    expect(content).toContain("export function add");
    expect(content).toContain("export function sub");
    expect(content).not.toMatch(/^function /m);
  }, 180_000);

  it("astgrep 搜索导入语句", async () => {
    await wd.putFiles({
      "ui/Button.tsx":
        "import React from 'react'\nimport { clsx } from 'clsx'\nexport const Button = () => <button />\n",
    });

    await ctx.session.prompt(
      "用 astgrep 搜索 ui 目录下所有 import 语句，看看有哪些导入",
    );
  }, 60_000);
});
