import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import { createWriteToolDefinition } from "@earendil-works/pi-coding-agent";

export const writeTool = (cwd: string) =>
  tool({
    ...createWriteToolDefinition(cwd),
    promptSnippet: "创建或覆盖文件",
    promptGuidelines: [
      "write 仅用于新建文件或整体覆盖。精确修改请使用 edit",
    ],
    description: `
创建或覆盖文件。文件不存在时自动创建（含父目录），存在时整体覆盖。
精确的部分修改请使用 edit(...)。
`.trim(),
    parameters: Type.Object({
      path: Type.String({ description: "文件路径（相对或绝对）" }),
      content: Type.String({ description: "要写入的完整内容" }),
    }),
  });
