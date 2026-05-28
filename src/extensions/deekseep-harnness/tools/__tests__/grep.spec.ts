import { describe, it, expect, beforeEach } from "vitest";
import { grepTool } from "../grep.ts";
import {
  execute,
  firstTextContent,
  workingDir,
  type WorkingDir,
} from "deepseek-harness/testingutil";

describe("grepTool", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("grep-testing");

    await wd.putFiles({
      "a.ts": `
hello
world
hello again
`.trimStart(),
      "b.ts": `
line1
line2

line4
`.trimStart(),
    });
  });

  it("搜索匹配行返回 file:line:content 格式", async () => {
    const tool = grepTool(wd.root);

    const result = await execute(tool, { pattern: "hello" });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("a.ts:1: hello");
    expect(text).toContain("a.ts:3: hello again");
    expect(text).not.toContain("world");
  });

  it("忽略大小写", async () => {
    const tool = grepTool(wd.root);

    const result = await execute(tool, {
      pattern: "HELLO",
      ignoreCase: true,
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("a.ts:1: hello");
  });

  it("字面字符串匹配", async () => {
    const tool = grepTool(wd.root);

    const result = await execute(tool, {
      pattern: "hello",
      literal: true,
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("hello");
    
    expect(text).toContain("hello again");
  });

  it("glob 过滤文件", async () => {
    const tool = grepTool(wd.root);

    const result = await execute(tool, {
      pattern: "line",
      glob: "*.ts",
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("b.ts");
    expect(text).toContain("line1");
  });

  it("指定搜索路径", async () => {
    await wd.putFiles({
      "sub/c.ts": "only in sub\n",
    });
    const tool = grepTool(wd.root);

    const result = await execute(tool, {
      pattern: "only",
      path: "sub",
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("only in sub");
  });

  it("无匹配时提示", async () => {
    const tool = grepTool(wd.root);

    const result = await execute(tool, { pattern: "nonexistent_xyz" });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("No matches found");
  });

  it("带上下文行", async () => {
    const tool = grepTool(wd.root);

    const result = await execute(tool, {
      pattern: "world",
      context: 1,
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("a.ts-1- hello");
    expect(text).toContain("a.ts:2: world");
    expect(text).toContain("a.ts-3- hello again");
  });
});
