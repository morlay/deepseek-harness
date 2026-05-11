import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const bash = (ctx: PluginInput) =>
  ({
    description: `执行 bash 命令。单次调用只能执行一条命令，不要用 \`|\` 或 \`&&\` 拼接多条命令。可用命令由系统权限配置控制，运行时白名单校验。示例: bash(command:"rg export src/", description:"搜索代码")`,
    parameters: Schema.Struct({
      command: Schema.String.annotate({
        description: "要执行的命令",
      }),
      timeout: Schema.optional(PositiveInt).annotate({
        default: 120_000,
        description: "超时时间（毫秒）",
      }),
      workdir: Schema.optional(Schema.String).annotate({
        description: "工作目录（相对路径）",
        default: ctx.directory,
      }),
      description: Schema.String.annotate({
        description: "命令的简短描述（5-10 词）",
      }),
    }),
  }) as const;
