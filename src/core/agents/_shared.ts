import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readSharedPrompt = async (name: string) =>
  await readFile(join(__dirname, "prompts", "shared", name), "utf-8");

const shared = {
  语言: await readSharedPrompt("language.md"),
  协作节奏: await readSharedPrompt("collaboration.md"),
  格式化规则: await readSharedPrompt("formatting.md"),
  工具使用: await readSharedPrompt("tool-use.md"),
} as const;

export const readPrompt = async (name: string) =>
  await readFile(join(__dirname, "prompts", name), "utf-8");

export const readPromptWithShared = async (name: string) => {
  let base = String(await readPrompt(name));

  for (const [section, content] of Object.entries(shared)) {
    base += `
 ## ${section}

 ${content}
 `;
  }

  return base;
};

export const withPermission = (writable: boolean) =>
  ({
    // 自定义
    hashread: "allow",
    hashedit: writable ? "allow" : "deny",
    hashgrep: "allow",
    astgrep: "allow",
    astedit: writable ? "allow" : "deny",
    // 内置
    glob: "allow",
    skill: "allow",
    task: "allow",
    todowrite: "allow",
    webfetch: "allow",
    write: "allow",
    // 禁用
    grep: "deny",
    websearch: "deny",
    edit: "deny",
    read: "deny",

    bash: {
      // 默认禁用一切 bash
      "*": "deny",

      // just recipe — 唯一可用命令入口
      "just *": "allow",

      // 有限放行
      "mv *": "allow",
      "rg *": "allow",
      "sg *": "allow",
      "jq *": "allow",

      // 版本控制
      "git *": "allow",
      "git push *": "deny",
      "git reset --hard": "deny",
      "git commit *": "ask",
    },
  }) as const;
