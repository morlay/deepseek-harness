import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import { rename, rm, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

export const moveTool = (cwd: string) =>
  tool({
    name: "move",
    label: "move",
    promptSnippet: "移动/重命名/删除文件",
    promptGuidelines: [
      "移动或重命名文件请使用 move，删除文件请将 newPath 设为 /dev/null",
    ],
    description: `
移动/重命名文件，或删除文件。newPath 为 /dev/null 时删除文件。目标父目录不存在时自动创建。
返回格式：M <path> -> <newPath>（移动）或 D <path>（删除）。
`.trim(),
    parameters: Type.Object({
      path: Type.String({ description: "源文件路径（相对或绝对）" }),
      newPath: Type.String({ description: "目标路径。设为 /dev/null 时删除文件" }),
    }),
    async execute(_toolCallId, { path, newPath }, signal, _onUpdate, _ctx) {
      const throwIfAborted = () => {
        if (signal?.aborted) throw new Error("操作已取消");
      };

      const absPath = resolve(cwd, path);
      throwIfAborted();

      if (newPath === "/dev/null") {
        await rm(absPath, { force: true });
        return {
          content: [{ type: "text", text: `D ${path}` }],
          details: undefined,
        };
      }

      const absNewPath = resolve(cwd, newPath);
      await mkdir(dirname(absNewPath), { recursive: true });
      throwIfAborted();
      await rename(absPath, absNewPath);

      return {
        content: [{ type: "text", text: `M ${path} -> ${newPath}` }],
        details: undefined,
      };
    },
  });
