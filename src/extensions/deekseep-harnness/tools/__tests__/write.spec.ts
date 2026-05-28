import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeTool } from "../write.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  execute,
  firstTextContent,
  workingDir,
  type WorkingDir,
} from "deepseek-harness/testingutil";

describe("writeTool", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("write-testing");
  });

  afterEach(async () => {
    await wd.cleanup();
  });

  it("创建新文件", async () => {
    const tool = writeTool(wd.root);

    const result = await execute(tool, {
      path: "new.txt",
      content: "hello\nworld\n",
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("Successfully wrote");

    const fileContent = await readFile(resolve(wd.root, "new.txt"), "utf-8");
    expect(fileContent).toBe("hello\nworld\n");
  });

  it("覆盖已存在的文件", async () => {
    await wd.putFiles({
      "data.txt": "old\n",
    });
    const tool = writeTool(wd.root);

    await execute(tool, {
      path: "data.txt",
      content: "new\n",
    });

    const fileContent = await readFile(resolve(wd.root, "data.txt"), "utf-8");
    expect(fileContent).toBe("new\n");
  });

  it("自动创建嵌套父目录", async () => {
    const tool = writeTool(wd.root);

    await execute(tool, {
      path: "sub/deep/nested.txt",
      content: "deep content\n",
    });

    const fileContent = await readFile(
      resolve(wd.root, "sub/deep/nested.txt"),
      "utf-8",
    );
    expect(fileContent).toBe("deep content\n");
  });

  it("写入空内容", async () => {
    const tool = writeTool(wd.root);

    await execute(tool, {
      path: "empty.txt",
      content: "",
    });

    const fileContent = await readFile(resolve(wd.root, "empty.txt"), "utf-8");
    expect(fileContent).toBe("");
  });
});
