import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  createBashToolDefinition,
  type BashOperations,
} from "@earendil-works/pi-coding-agent";
import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";

export const bashTool = (
  cwd: string,
  opts: { operations?: BashOperations } = {},
) => {
  const origin = createBashToolDefinition(cwd, { operations: opts.operations });

  return tool({
    ...origin,
    promptSnippet: "执行命令",
    promptGuidelines: [
      `内置工具可解决的问题，请勿使用 bash(...)`,
      `应该使用单一命令，请勿使用 &&`,
      `严禁 bash(command:"git reset --hard" | "rm -rf /") 等破坏性操作`,
    ],
    description: `
在当前工作目录执行命令，返回 stdout 和 stderr。
输出截断到最后 ${DEFAULT_MAX_LINES} 行或 ${DEFAULT_MAX_BYTES / 1024}KB（以先到者为准）。
截断时完整输出保存到临时文件
`.trimStart(),
    parameters: Type.Object({
      command: Type.String({
        description: "要执行的命令",
      }),
      timeout: Type.Optional(
        Type.Integer({
          default: 120,
          exclusiveMinimum: 0,
          description: "超时时间",
        }),
      ),
    }),
  });
};
