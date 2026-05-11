import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const task = (_ctx: PluginInput) =>
  ({
    description:
      "启动子 agent 并行处理复杂多步骤任务。需指定 agent 类型、详细任务描述和预期返回信息。",
    parameters: Schema.Struct({
      description: Schema.String.annotate({
        description: "任务简短描述（3-5 词）",
      }),
      prompt: Schema.String.annotate({ description: "任务的详细描述" }),
      subagent_type: Schema.String.annotate({ description: "子 agent 类型" }),
      task_id: Schema.optional(Schema.String).annotate({
        description: "续接之前任务的 ID",
      }),
      command: Schema.optional(Schema.String).annotate({
        description: "触发此任务的指令",
      }),
    }),
  }) as const;
