import { describe, it, expect } from "vitest";
import { bashTool } from "../bash.ts";
import { execute, firstTextContent } from "deepseek-harness/testingutil";

describe("bashTool", () => {
  const cwd = process.cwd();

  it("执行命令返回 stdout", async () => {
    const tool = bashTool(cwd);

    const result = await execute(tool, { command: "echo hello" });

    expect(firstTextContent(result)?.text).toContain("hello");
  });

  it("执行 pwd 返回当前目录", async () => {
    const tool = bashTool(cwd);

    const result = await execute(tool, { command: "pwd" });

    expect(firstTextContent(result)?.text).toContain(cwd);
  });

  it("命令不存在时报错", async () => {
    const tool = bashTool(cwd);

    await expect(
      execute(tool, { command: "nonexistent_command_xyz" }),
    ).rejects.toThrow();
  });
});
