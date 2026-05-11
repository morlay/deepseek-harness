import type { PluginInput } from "@opencode-ai/plugin";
import { Schema } from "effect";

export const webfetch = (_ctx: PluginInput) =>
  ({
    description:
      "获取指定 URL 的内容，默认返回 markdown 格式。自动将 HTTP 升级为 HTTPS。",
    parameters: Schema.Struct({
      url: Schema.String.annotate({ description: "要获取的 URL 地址" }),
      format: Schema.optional(
        Schema.Literals(["text", "markdown", "html"]),
      ).annotate({
        default: "markdown",
        description: "返回格式",
      }),
      timeout: Schema.optional(Schema.Number).annotate({
        default: 120, // s
        description: "超时时间（秒）",
      }),
    }),
  }) as const;
