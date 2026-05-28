import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { editTool } from "../edit.ts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  execute,
  firstTextContent,
  workingDir,
  type WorkingDir,
} from "deepseek-harness/testingutil";

describe("editTool", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("edit-testing");
  });

  afterEach(async () => {
    await wd.cleanup();
  });

  it("单处文本替换", async () => {
    await wd.putFiles({
      "data.txt": "line1\nline2\nline3\n",
    });
    const tool = editTool(wd.root);

    const result = await execute(tool, {
      path: "data.txt",
      edits: [{ oldText: "line2", newText: "LINE_TWO" }],
    });
    const text = firstTextContent(result)?.text;

    expect(text).toContain("Successfully replaced");

    const fileContent = await readFile(resolve(wd.root, "data.txt"), "utf-8");
    expect(fileContent).toBe("line1\nLINE_TWO\nline3\n");
  });

  it("多处同时编辑一次调用完成", async () => {
    await wd.putFiles({
      "data.txt": "a\nb\nc\nd\n",
    });
    const tool = editTool(wd.root);

    await execute(tool, {
      path: "data.txt",
      edits: [
        { oldText: "a", newText: "A" },
        { oldText: "c", newText: "C" },
      ],
    });

    const fileContent = await readFile(resolve(wd.root, "data.txt"), "utf-8");
    expect(fileContent).toBe("A\nb\nC\nd\n");
  });

  it("oldText 必须精确唯一匹配，重复文本应合并为一次 edit", async () => {
    await wd.putFiles({
      "data.txt": "dup\ndup\nother\n",
    });
    const tool = editTool(wd.root);

    await expect(
      execute(tool, {
        path: "data.txt",
        edits: [{ oldText: "dup", newText: "unique" }],
      }),
    ).rejects.toThrow();
  });

  it("文件不存在时抛出错误", async () => {
    const tool = editTool(wd.root);

    await expect(
      execute(tool, {
        path: "no-such-file.txt",
        edits: [{ oldText: "x", newText: "y" }],
      }),
    ).rejects.toThrow();
  });

  it("空 edits 抛出错误", async () => {
    await wd.putFiles({
      "data.txt": "content\n",
    });
    const tool = editTool(wd.root);

    await expect(
      execute(tool, {
        path: "data.txt",
        edits: [],
      }),
    ).rejects.toThrow();
  });

  it("替换整个文件内容", async () => {
    await wd.putFiles({
      "data.txt": "old content\n",
    });
    const tool = editTool(wd.root);

    await execute(tool, {
      path: "data.txt",
      edits: [{ oldText: "old content\n", newText: "new content\n" }],
    });

    const fileContent = await readFile(resolve(wd.root, "data.txt"), "utf-8");
    expect(fileContent).toBe("new content\n");
  });

  it("删除文本（替换为空）", async () => {
    await wd.putFiles({
      "data.txt": "keep\nremove\nkeep\n",
    });
    const tool = editTool(wd.root);

    await execute(tool, {
      path: "data.txt",
      edits: [{ oldText: "remove\n", newText: "" }],
    });

    const fileContent = await readFile(resolve(wd.root, "data.txt"), "utf-8");
    expect(fileContent).toBe("keep\nkeep\n");
  });

  it("插入文本（替换空为内容）", async () => {
    await wd.putFiles({
      "data.txt": "before\nafter\n",
    });
    const tool = editTool(wd.root);

    await execute(tool, {
      path: "data.txt",
      edits: [{ oldText: "before\n", newText: "before\ninserted\n" }],
    });

    const fileContent = await readFile(resolve(wd.root, "data.txt"), "utf-8");
    expect(fileContent).toBe("before\ninserted\nafter\n");
  });

  it("oldText 不存在于文件中时抛出错误", async () => {
    await wd.putFiles({
      "data.txt": "line1\n",
    });
    const tool = editTool(wd.root);

    await expect(
      execute(tool, {
        path: "data.txt",
        edits: [{ oldText: "not found", newText: "x" }],
      }),
    ).rejects.toThrow();
  });
});
