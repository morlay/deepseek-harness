import { readdir, rmdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * 文件删除后尝试清理空父目录（向上递归到 workDir 为止）。
 */
export async function tryRemoveEmptyDir(dir: string, workDir: string) {
  if (dir === workDir) return;
  try {
    const entries = await readdir(dir);
    if (entries.length === 0) {
      await rmdir(dir);
      await tryRemoveEmptyDir(dirname(dir), workDir);
    }
  } catch {
    // 目录不存在或无权访问，忽略
  }
}

export type ReplaceAction = { replace: string; old: string };
export type InsertAction = { insert: string; after?: string };
export type PatchAction = ReplaceAction | InsertAction;

/**
 * 按顺序执行 patch actions。注意：每对 replace/old 只替换首次匹配（indexOf），
 * 若同一文本在多处出现，需在 actions 中列出多个 replace 操作。
 */
export function applyActions(content: string, actions: PatchAction[]): string {
  for (const action of actions) {
    if ("replace" in action) {
      const idx = content.indexOf(action.old);
      if (idx === -1) {
        throw new Error(`未找到替换文本: "${action.old.slice(0, 80)}"`);
      }
      content =
        content.slice(0, idx) +
        action.replace +
        content.slice(idx + action.old.length);
    } else {
      if (action.after && action.after !== "") {
        const idx = content.indexOf(action.after);
        if (idx === -1) {
          throw new Error(`未找到插入位置: "${action.after.slice(0, 80)}"`);
        }
        const pos = idx + action.after.length;
        const leading = pos === 0 ? "" : "\n";
        const trailing = content.slice(pos).startsWith("\n") ? "" : "\n";
        content =
          content.slice(0, pos) +
          leading +
          action.insert +
          trailing +
          content.slice(pos);
      } else {
        const sep = content === "" || content.endsWith("\n") ? "" : "\n";
        content = content + sep + action.insert + "\n";
      }
    }
  }
  return content;
}
