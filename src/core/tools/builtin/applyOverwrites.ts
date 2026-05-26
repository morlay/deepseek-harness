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
  (ctx: PluginInput) => { description: string; parameters?: any }
> = {
  bash,
  edit,
  glob,
  grep,
  lsp,
  patch: () => ({
    description: "将补丁应用到文件中。适用于应用来自各种来源的 diff 和补丁。",
  }),
  question: () => ({
    description:
      "在执行过程中向用户提问。适用于收集偏好、澄清模糊指令、获取实现决策等场景。",
  }),
  read,
  skill,
  task,
  todowrite,
  webfetch,
  websearch: () => ({
    description:
      "在网络上搜索信息（通过 Exa AI）。适用于研究主题、查找超出训练数据截止日期的信息。",
  }),
  write,
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
    if (x.parameters !== undefined) {
      output.parameters = x.parameters;
    }
  }
}
