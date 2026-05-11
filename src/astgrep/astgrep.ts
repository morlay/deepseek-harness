import { findInFiles, Lang } from "@ast-grep/napi";

export function toLang(s: string | undefined): Lang {
  if (!s) return Lang.TypeScript;
  const lower = s.toLowerCase();
  if (lower === "typescript" || lower === "ts") return Lang.TypeScript;
  if (lower === "tsx") return Lang.Tsx;
  if (lower === "javascript" || lower === "js") return Lang.JavaScript;
  if (lower === "html") return Lang.Html;
  if (lower === "css") return Lang.Css;
  return Lang.TypeScript;
}

export async function astFindInFiles(
  lang: string | undefined,
  options: { paths: string[]; pattern: string },
  callback: (err: unknown, nodes: import("@ast-grep/napi").SgNode[]) => void,
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
