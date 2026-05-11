import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const todowrite = (_ctx: PluginInput) =>
  ({
    description:
      "创建和管理结构化任务列表，跟踪当前会话进度。用于多步骤复杂任务。",
    parameters: Schema.Struct({
      todos: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            content: Schema.String.annotate({ description: "任务简述" }),
            status: Schema.Literals([
              "pending",
              "in_progress",
              "completed",
              "cancelled",
            ]).annotate({ description: "任务状态" }),
            priority: Schema.Literals(["high", "medium", "low"]).annotate({
              description: "优先级",
            }),
          }),
        ),
      ).annotate({ description: "任务列表" }),
    }),
  }) as const;
