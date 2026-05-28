import type {
  ExtensionAPI,
  ToolDefinition,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";

export function useTools(
  pi: ExtensionAPI,
  ...tools: ToolDefinition<any, any, any>[]
) {
  const toolNames: string[] = [];

  for (const tool of tools) {
    pi.registerTool(tool);
    toolNames.push(tool.name);
  }

  pi.setActiveTools(toolNames);
}

export function activeTools(
  pi: ExtensionAPI,
  opt: { schemaOnly?: boolean } = {},
) {
  const activeTools = pi.getActiveTools();
  const tools = pi.getAllTools().filter((t) => activeTools.includes(t.name));

  if (opt.schemaOnly) {
    return tools.map(
      (x) =>
        ({
          name: x.name,
          description: x.description,
          parameters: x.parameters,
          sourceInfo: x.sourceInfo,
        }) satisfies ToolInfo,
    );
  }

  return tools;
}
