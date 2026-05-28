import type {
  ToolDefinition,
  AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import type { TSchema, Static, TextContent } from "@earendil-works/pi-ai";

export async function execute<
  TParams extends TSchema = TSchema,
  TDetais = unknown,
>(tool: ToolDefinition<TParams, TDetais>, params: Static<TParams>) {
  return await tool.execute(
    "data-test",
    params,
    undefined,
    undefined,
    null as any,
  );
}

export function firstTextContent<TDetais = unknown>(
  ret: AgentToolResult<TDetais>,
): TextContent | null {
  if (ret.content) {
    for (const c of ret.content) {
      if (c.type == "text") {
        return c;
      }
    }
  }
  return null;
}
