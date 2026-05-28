import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import {
  createGrepToolDefinition,
  DEFAULT_MAX_BYTES,
} from "@earendil-works/pi-coding-agent";

const DEFAULT_LIMIT = 100;

export const grepTool = (cwd: string) =>
  tool({
    ...createGrepToolDefinition(cwd),
    promptSnippet: "正则搜索文本，遵守 .gitignore",
    promptGuidelines: [
      `使用 grep(...) 来搜索文本，而不是使用 bash(command: "rg")`,
    ],
    description: `
正则搜索文本（ripgrep），遵守 .gitignore。按文件拆分返回匹配行。
输出截断到 ${DEFAULT_LIMIT} 个匹配或 ${DEFAULT_MAX_BYTES / 1024}KB（以先到者为准）。
长行会被截断。
`.trim(),
    parameters: Type.Object({
      pattern: Type.String({
        description: "正则匹配模式（PCRE），或 literal 为 true 时作为字面字符串",
        minLength: 1,
      }),
      path: Type.Optional(
        Type.String({ description: "搜索目录或文件，默认当前目录" }),
      ),
      glob: Type.Optional(
        Type.String({
          description: "文件过滤 glob，如 '*.ts' 或 '**/*.spec.ts'",
        }),
      ),
      ignoreCase: Type.Optional(
        Type.Boolean({ description: "忽略大小写，默认 false" }),
      ),
      literal: Type.Optional(
        Type.Boolean({
          description: "将 pattern 视为字面字符串而非正则，默认 false",
        }),
      ),
      context: Type.Optional(
        Type.Number({
          description: "匹配行前后各显示的行数，默认 0",
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "最大匹配数", default: DEFAULT_LIMIT }),
      ),
    }),
  });
