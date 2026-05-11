import type { PluginInput } from "@opencode-ai/plugin";
import { bash } from "./bash.ts";
import { lsp } from "./lsp.ts";
import { sg } from "./sg.ts";
import { skill } from "./skill.ts";
import { task } from "./task.ts";
import { todowrite } from "./todowrite.ts";
import { webfetch } from "./webfetch.ts";

const overwrites: Record<
  string,
  (ctx: PluginInput) => { description: string; parameters: any }
> = {
  bash,
  lsp,
  sg,
  skill,
  task,
  todowrite,
  webfetch,
};

export function applyOverwrites(
  ctx: PluginInput,
  output: { description: string; parameters: any },
  toolID: string,
) {
  const overwrite = overwrites[toolID];
  if (overwrite) {
    const x = overwrite(ctx);
    output.description = x.description;
    output.parameters = x.parameters;
  }
}
