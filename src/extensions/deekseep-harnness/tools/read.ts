import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_LINES,
  createReadToolDefinition,
} from "@earendil-works/pi-coding-agent";

export const readTool = (cwd: string) =>
  tool({
    ...createReadToolDefinition(cwd),
    promptSnippet: "读取文件内容",
    promptGuidelines: [
      `使用 read(...) 来读取文件，而不是使用 bash(command: "cat" | "bat" | "sed" | "sd")`,
    ],
    description: `
读取文件内容（支持文本和图片）。文本输出会按行数或大小截断。大文件用 offset/limit 分段读取。
目录列表请用 find(...)。
`.trim(),
    parameters: Type.Object({
      path: Type.String({ description: "文件路径（相对或绝对）" }),
      offset: Type.Optional(
        Type.Number({
          description: "起始行号，从 1 开始",
          default: 1,
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "最大读取行数",
          default: DEFAULT_MAX_LINES,
        }),
      ),
    }),
  });
