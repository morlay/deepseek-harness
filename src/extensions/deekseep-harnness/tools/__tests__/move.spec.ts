import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { moveTool } from "../move.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  execute,
  firstTextContent,
  workingDir,
  type WorkingDir,
} from "deepseek-harness/testingutil";

describe("moveTool", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("move-testing");
  });

  afterEach(async () => {
    await wd.cleanup();
  });

  it("重命名文件", async () => {
    await wd.putFiles({
      "old.txt": "hello\n",
    });
    const tool = moveTool(wd.root);

    const result = await execute(tool, {
      path: "old.txt",
      newPath: "new.txt",
    });
    const text = firstTextContent(result)?.text;

    expect(text).toBe("M old.txt -> new.txt");

    const content = await readFile(resolve(wd.root, "new.txt"), "utf-8");
    expect(content).toBe("hello\n");

    await expect(
      readFile(resolve(wd.root, "old.txt"), "utf-8"),
    ).rejects.toThrow();
  });

  it("移动到嵌套目录", async () => {
    await wd.putFiles({
      "data.txt": "content\n",
    });
    const tool = moveTool(wd.root);

    await execute(tool, {
      path: "data.txt",
      newPath: "sub/deep/data.txt",
    });

    const content = await readFile(
      resolve(wd.root, "sub/deep/data.txt"),
      "utf-8",
    );
    expect(content).toBe("content\n");
  });

  it("newPath 为 /dev/null 时删除文件", async () => {
    await wd.putFiles({
      "remove-me.txt": "bye\n",
    });
    const tool = moveTool(wd.root);

    const result = await execute(tool, {
      path: "remove-me.txt",
      newPath: "/dev/null",
    });
    const text = firstTextContent(result)?.text;

    expect(text).toBe("D remove-me.txt");

    await expect(
      readFile(resolve(wd.root, "remove-me.txt"), "utf-8"),
    ).rejects.toThrow();
  });

  it("删除不存在的文件仍返回成功（force: true）", async () => {
    const tool = moveTool(wd.root);

    const result = await execute(tool, {
      path: "no-such.txt",
      newPath: "/dev/null",
    });
    const text = firstTextContent(result)?.text;

    expect(text).toBe("D no-such.txt");
  });
});
