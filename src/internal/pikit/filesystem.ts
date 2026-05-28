import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export const DEFAULT_FILESYSTEM_CONFIG = {
  denyRead: ["/Users", "/home"],
  denyWrite: [".env", ".env.*", "*.pem", "*.key"],
  allowWrite: [".", "/tmp", "~/Library/Caches"],
  allowRead: [
    ".",
    "~/.local",
    "~/.agents",
    "~/.cache",
    "~/Library",
    "~/go/pkg",
  ],
};

export interface FilesystemCheckResult {
  blocked: boolean;

  reason?: string;
}

export function expandPath(filePath: string): string {
  const expanded = filePath.replace(/^~(?=$|\/)/, homedir());
  return resolve(expanded);
}

export function canonicalizePath(filePath: string): string {
  const abs = expandPath(filePath);
  try {
    return realpathSync.native(abs);
  } catch {
    const tail: string[] = [];
    let probe = abs;
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) return abs;
      tail.unshift(basename(probe));
      probe = parent;
    }
    try {
      return resolve(realpathSync.native(probe), ...tail);
    } catch {
      return abs;
    }
  }
}

export function matchesPattern(filePath: string, patterns: string[]): boolean {
  const abs = canonicalizePath(filePath);
  return patterns.some((p) => {
    const absP = p.includes("*") ? expandPath(p) : canonicalizePath(p);
    if (p.includes("*")) {
      const escaped = absP
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(abs);
    }
    const sep = absP.endsWith("/") ? "" : "/";
    return abs === absP || abs.startsWith(absP + sep);
  });
}

export function isPathDeniedForRead(
  path: string,
  denyRead: string[],
  allowRead: string[],
): boolean {
  if (matchesPattern(path, denyRead)) {
    if (allowRead.length > 0 && matchesPattern(path, allowRead)) {
      return false;
    }
    return true;
  }
  return false;
}

export function isPathDeniedForWrite(
  path: string,
  denyWrite: string[],
  allowWrite: string[],
): boolean {
  if (matchesPattern(path, denyWrite)) {
    return true;
  }

  if (allowWrite.length > 0 && !matchesPattern(path, allowWrite)) {
    return true;
  }
  return false;
}

export function shouldPromptForWrite(
  path: string,
  allowWrite: string[],
  matchFn: (path: string, patterns: string[]) => boolean = matchesPattern,
): boolean {
  return allowWrite.length === 0 || !matchFn(path, allowWrite);
}

export type FileOperation = "read" | "write";

export function checkFilesystemPath(
  path: string,
  filesystem: {
    denyRead: string[];
    allowRead?: string[];
    denyWrite: string[];
    allowWrite?: string[];
  },
  operation: FileOperation,
): FilesystemCheckResult {
  if (operation === "write") {
    if (
      isPathDeniedForWrite(
        path,
        filesystem.denyWrite,
        filesystem.allowWrite ?? [],
      )
    ) {
      return {
        blocked: true,
        reason: `路径 "${path}" 不允许写入`,
      };
    }
  } else {
    if (
      isPathDeniedForRead(path, filesystem.denyRead, filesystem.allowRead ?? [])
    ) {
      return {
        blocked: true,
        reason: `路径 "${path}" 不允许读取`,
      };
    }
  }

  return { blocked: false };
}
