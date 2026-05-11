import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

const operations = {
  goToDefinition: "查找符号的定义位置",
  findReferences: "查找所有引用该符号的位置",
  hover: "获取悬停信息（文档、类型）",
  documentSymbol: "获取文档内的所有符号（函数、类等）",
  workspaceSymbol: "按查询字符串搜索项目范围内的符号",
  goToImplementation: "查找接口或抽象方法的实现",
  prepareCallHierarchy: "获取调用层次结构",
  incomingCalls: "查找所有调用该函数的函数/方法",
  outgoingCalls: "查找该函数调用的所有函数/方法",
} as const;

const operationsList = Object.entries(operations)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n");

export const lsp = (_ctx: PluginInput) =>
  ({
    description: `
与 Language Server Protocol (LSP) 交互，获取代码智能信息。操作名需传入英文字面量（如 goToDefinition、findReferences）。示例: lsp(operation:"goToDefinition", filePath:"src/index.ts", line:10, character:5)
`.trim(),
    parameters: Schema.Struct({
      operation: Schema.Literals(Object.keys(operations)).annotate({
        description: `要执行的 LSP 操作: 支持的操作: ${operationsList}`,
      }),
      filePath: Schema.String.annotate({
        description: "文件的相对路径",
      }),
      line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "行号（1-based，与编辑器中显示一致）",
      }),
      character: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "字符偏移（1-based，与编辑器中显示一致）",
      }),
      query: Schema.optional(Schema.String).annotate({
        description: "workspaceSymbol 的搜索查询。传空字符串获取全部符号。",
      }),
    }),
  }) as const;
