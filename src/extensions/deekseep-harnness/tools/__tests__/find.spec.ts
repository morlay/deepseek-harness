import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findTool } from "../find.ts";

import {
  execute,
  firstTextContent,
  workingDir,
  type WorkingDir,
} from "deepseek-harness/testingutil";

describe("按 glob 模式搜索文件", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("find-testing");

    await wd.putFiles({
      "a.ts": "",
      "b.ts": "",
      "c.json": "",
      "sub/a.ts": "",
      "sub/b.ts": "",
      "ignored/x.ts": "",
      ".gitignore": `
ignored/
`,
    });
  });

  afterEach(async () => {
    await wd.cleanup();
  });

  it("按 glob 模式搜索文件", async () => {
    const tool = findTool(wd.root);

    const ret = await execute(tool, { pattern: "*.ts" });
    const text = firstTextContent(ret)?.text;

    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
    expect(text).not.toContain("c.json");
  });

  it("搜索嵌套目录", async () => {
    const tool = findTool(wd.root);

    const ret = await execute(tool, { pattern: "**/*.ts" });
    const text = firstTextContent(ret)?.text;

    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
  });

  it("无匹配结果时返回空", async () => {
    const tool = findTool(wd.root);
    const ret = await execute(tool, { pattern: "*.go" });

    const text = firstTextContent(ret)?.text;

    expect(text).not.toContain(".ts");
  });

  it("遵守 .gitignore", async () => {
    const tool = findTool(wd.root);

    const ret = await execute(tool, { pattern: "**/*.ts" });

    const text = firstTextContent(ret)?.text;

    expect(text).toContain("a.ts");
    expect(text).not.toContain("x.ts");
  });

  it("跳过 .gitignore", async () => {
    const tool = findTool(wd.root);

    const ret = await execute(tool, { pattern: "*.ts", path: "ignored/" });

    const text = firstTextContent(ret)?.text;

    expect(text).toContain("x.ts");
  });
});
