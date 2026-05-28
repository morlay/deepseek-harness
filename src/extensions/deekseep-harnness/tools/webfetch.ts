import { tool } from "./_inernal";
import { Type } from "@earendil-works/pi-ai";
import { webFetch } from "deepseek-harness/webfetch";

export const webfetchTool = () => {
  return tool({
    name: "webfetch",
    label: "Web Fetch",
    description: `
获取指定 URL 的内容，支持 HTML / JSON / Markdown。
当目标网站返回 HTML 但需要 Markdown 时，自动使用 turndown 转换。
默认根据 Content-Type 自动判断返回格式。
`.trim(),
    promptSnippet: "获取网页内容",
    promptGuidelines: [
      `使用 webfetch(...) 来获取网页内容，而不是使用 bash(command: "curl" | "wget")`,
      `默认自动根据 Content-Type 返回最佳格式（HTML→Markdown, JSON→JSON）`,
    ],
    parameters: Type.Object({
      url: Type.String({
        description: "要获取的 URL",
      }),
      format: Type.Optional(
        Type.Union(
          [
            Type.Literal("auto"),
            Type.Literal("html"),
            Type.Literal("json"),
            Type.Literal("markdown"),
          ],
          {
            default: "auto",
            description:
              "期望的返回格式：auto | html | json | markdown，默认 auto",
          },
        ),
      ),
      timeout: Type.Optional(
        Type.Integer({
          default: 30_000,
          exclusiveMinimum: 0,
          description: "超时时间 (ms)",
        }),
      ),
      maxBytes: Type.Optional(
        Type.Integer({
          default: 5 * 1024 * 1024,
          exclusiveMinimum: 0,
          description: "最大响应体大小 (bytes)，默认 5MB",
        }),
      ),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await webFetch(params.url, {
        format: params.format,
        timeout: params.timeout,
        maxBytes: params.maxBytes,
      });

      return {
        content: [
          {
            type: "text",
            text: result.content,
          },
        ],
        details: {
          format: result.format,
          contentType: result.contentType,
          status: result.status,
          url: result.url,
        },
      };
    },
  });
};
