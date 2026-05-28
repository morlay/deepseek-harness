import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readTool } from "../read.ts";
import {
  workingDir,
  type WorkingDir,
  execute,
  firstTextContent,
} from "deepseek-harness/testingutil";

describe("readTool", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("read-testing");

    await wd.putFiles({
      "lines.ts": "line1\nline2\nline3\nline4\n",
      "skip.ts": "line1\nline2\n\nline4",
    });
  });

  afterEach(async () => {
    await wd.cleanup();
  });

  it("读取文件全部内容", async () => {
    const tool = readTool(wd.root);

    const result = await execute(tool, { path: "lines.ts" });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("line1");
    expect(text).toContain("line2");
    expect(text).toContain("line3");
    expect(text).toContain("line4");
  });

  it("limit 限制读取行数", async () => {
    const tool = readTool(wd.root);

    const result = await execute(tool, { path: "lines.ts", limit: 2 });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("line1");
    expect(text).toContain("line2");
    expect(text).not.toContain("line3");
  });

  it("offset 从指定行开始读取", async () => {
    const tool = readTool(wd.root);

    const result = await execute(tool, {
      path: "lines.ts",
      offset: 2,
      limit: 2,
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("line2");
    expect(text).toContain("line3");
    expect(text).not.toContain("line1");
    expect(text).not.toContain("line4");
  });

  it("offset 超出文件行数时抛出错误", async () => {
    const tool = readTool(wd.root);

    await expect(
      execute(tool, { path: "lines.ts", offset: 100 }),
    ).rejects.toThrow();
  });

  it("不存在的文件抛出错误", async () => {
    const tool = readTool(wd.root);

    await expect(
      execute(tool, { path: "no-such-file.txt" }),
    ).rejects.toThrow();
  });
});
