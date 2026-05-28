import { findInFiles, Lang, type SgNode } from "@ast-grep/napi";
import { readFile, writeFile } from "node:fs/promises";

type NapiLang = Lang | (string & {});

const LANG_MAP: Record<string, NapiLang> = {
  html: Lang.Html,
  javascript: Lang.JavaScript,
  js: Lang.JavaScript,
  jsx: Lang.JavaScript,
  tsx: Lang.Tsx,
  css: Lang.Css,
  typescript: Lang.TypeScript,
  ts: Lang.TypeScript,

  bash: "Bash",
  c: "C",
  cpp: "Cpp",
  "c++": "Cpp",
  csharp: "CSharp",
  cs: "CSharp",
  elixir: "Elixir",
  ex: "Elixir",
  go: "Go",
  golang: "Go",
  haskell: "Haskell",
  hs: "Haskell",
  hcl: "Hcl",
  java: "Java",
  json: "Json",
  kotlin: "Kotlin",
  kt: "Kotlin",
  lua: "Lua",
  nix: "Nix",
  php: "Php",
  python: "Python",
  py: "Python",
  ruby: "Ruby",
  rb: "Ruby",
  rust: "Rust",
  rs: "Rust",
  scala: "Scala",
  solidity: "Solidity",
  sol: "Solidity",
  swift: "Swift",
  yaml: "Yaml",
  yml: "Yaml",
};

export function toLang(s: string | undefined): NapiLang {
  if (!s) return Lang.TypeScript;
  const lower = s.toLowerCase();
  if (lower in LANG_MAP) return LANG_MAP[lower]!;

  return lower as NapiLang;
}

export function expandRewrite(rewrite: string, node: SgNode): string {
  return rewrite.replace(/\$(\w+)/g, (_, name) => {
    const matched = node.getMatch(name);
    return matched ? matched.text() : `$${name}`;
  });
}

export interface AstMatch {
  file: string;

  text: string;

  line: number;

  column: number;
}

export interface AstGrepOptions {
  paths: string[];
  pattern: string;
}

export async function astGrep(
  lang: string | undefined,
  options: AstGrepOptions,
): Promise<AstMatch[]> {
  const matches: AstMatch[] = [];

  await findInFiles(
    toLang(lang),
    {
      paths: options.paths,
      matcher: { rule: { pattern: options.pattern } },
    },
    (_err, nodes) => {
      for (const node of nodes) {
        const range = node.range();
        matches.push({
          file: node.getRoot().filename(),
          text: node.text(),
          line: range.start.line + 1,
          column: range.start.column + 1,
        });
      }
    },
  );

  return matches;
}

export interface AstEditOptions {
  paths: string[];
  pattern: string;
  rewrite: string;
}

export interface AstEditResult {
  file: string;
  count: number;
}

export async function astEdit(
  lang: string | undefined,
  options: AstEditOptions,
): Promise<AstEditResult[]> {
  const fileEdits = new Map<
    string,
    Array<{ oldText: string; newText: string }>
  >();

  await findInFiles(
    toLang(lang),
    {
      paths: options.paths,
      matcher: { rule: { pattern: options.pattern } },
    },
    (_err, nodes) => {
      for (const node of nodes) {
        const filePath = node.getRoot().filename();
        const oldText = node.text();
        const expanded = expandRewrite(options.rewrite, node);
        if (!fileEdits.has(filePath)) fileEdits.set(filePath, []);
        fileEdits.get(filePath)!.push({ oldText, newText: expanded });
      }
    },
  );

  const results: AstEditResult[] = [];
  for (const [filePath, edits] of fileEdits) {
    let content = await readFile(filePath, "utf-8");
    for (const { oldText, newText } of edits) {
      content = content.replace(oldText, newText);
    }
    await writeFile(filePath, content, "utf-8");
    results.push({ file: filePath, count: edits.length });
  }

  return results;
}

export interface AstFindOptions {
  paths: string[];
  pattern: string;
}

export async function astFindInFiles(
  lang: string | undefined,
  options: AstFindOptions,
  callback: (err: unknown, nodes: SgNode[]) => void,
): Promise<void> {
  await findInFiles(
    toLang(lang),
    {
      paths: options.paths,
      matcher: { rule: { pattern: options.pattern } },
    },
    callback,
  );
}
