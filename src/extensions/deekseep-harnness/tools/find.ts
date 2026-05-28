import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import {
  createFindToolDefinition,
  DEFAULT_MAX_BYTES,
} from "@earendil-works/pi-coding-agent";

const DEFAULT_LIMIT = 1000;

export const findTool = (cwd: string) =>
  tool({
    ...createFindToolDefinition(cwd),
    promptSnippet: "按 glob 模式查找文件，遵守 .gitignore",
    promptGuidelines: [
      `使用 find(...) 来搜索文件，而不是使用 bash(command: "ls" | "eza" | "find" | "fd")`,
      `在默认目录下，会因为 .gitignore 的影响找不到文件，可指定 path 来精确匹配`,
    ],
    description: `
按 glob 模式搜索文件，返回匹配文件的相对路径列表，遵守 .gitignore。
输出截断到 ${DEFAULT_LIMIT} 个结果或 ${DEFAULT_MAX_BYTES / 1024}KB。
`.trimStart(),
    parameters: Type.Object({
      pattern: Type.String({
        description:
          "glob 匹配模式，如 '*.ts'、'**/*.json' 或 'src/**/*.spec.ts'",
      }),
      path: Type.Optional(
        Type.String({
          description: "搜索目录",
          default: cwd,
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "最大结果数",
          default: DEFAULT_LIMIT,
        }),
      ),
    }),
  });
