export * from "./sg.ts";
export * from "./patch.ts";

import type { PluginInput } from "@opencode-ai/plugin";
import { bash } from "./bash.ts";
import { edit } from "./edit.ts";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { lsp } from "./lsp.ts";
import { read } from "./read.ts";
import { skill } from "./skill.ts";
import { task } from "./task.ts";
import { todowrite } from "./todowrite.ts";
import { webfetch } from "./webfetch.ts";
import { write } from "./write.ts";

const overwrites: Record<
  string,
  (ctx: PluginInput) => { description: string; parameters: any }
> = {
  bash: bash,
  edit: edit,
  glob: glob,
  grep: grep,
  lsp: lsp,
  read: read,
  skill: skill,
  task: task,
  todowrite: todowrite,
  webfetch: webfetch,
  write: write,
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
