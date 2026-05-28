import { existsSync } from "node:fs";

import { DEFAULT_FILESYSTEM_CONFIG } from "./filesystem";

export {
  DEFAULT_FILESYSTEM_CONFIG,
  type FileOperation,
  type FilesystemCheckResult,
  expandPath,
  canonicalizePath,
  matchesPattern,
  isPathDeniedForRead,
  isPathDeniedForWrite,
  shouldPromptForWrite,
  checkFilesystemPath,
} from "./filesystem";
import { spawn } from "node:child_process";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
export { SandboxManager } from "@anthropic-ai/sandbox-runtime";
export type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { existsSync as fsExistsSync, readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { type Shell } from "./shell";

export interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean;
  shell?: Shell;
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  network: {
    allowedDomains: [],
    deniedDomains: [],
  },
  filesystem: { ...DEFAULT_FILESYSTEM_CONFIG },
  shell: {
    allowMultiple: false,
    allowPipe: true,
    permissons: {
      "*": "deny",
      "git *": "allow",
      "git push *": "deny",
      "git reset --hard": "deny",

      "just *": "allow",
      "rg *": "allow",
      "sg *": "allow",

      "jq *": "allow",
      "awk *": "allow",
      "head *": "allow",
      "tail *": "allow",
      "cut *": "allow",
      "wc *": "allow",
      "sort *": "allow",
      "uniq *": "allow",
    },
  },
};

function deepMerge(
  base: SandboxConfig,
  overrides: Partial<SandboxConfig>,
): SandboxConfig {
  const result: SandboxConfig = { ...base };

  if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
  if (overrides.network) {
    result.network = { ...base.network, ...overrides.network };
  }
  if (overrides.filesystem) {
    result.filesystem = { ...base.filesystem, ...overrides.filesystem };
  }
  if (overrides.shell) {
    result.shell = {
      ...base.shell,
      ...overrides.shell,
      permissons: {
        ...base.shell?.permissons,
        ...overrides.shell.permissons,
      },
    };
  }

  return result;
}

export function loadSandboxConfig(
  cwd: string,
  agentDir: string,
): SandboxConfig {
  const projectConfigPath = pathJoin(cwd, ".pi", "sandbox.json");
  const globalConfigPath = pathJoin(agentDir, "sandbox.json");

  let globalConfig: Partial<SandboxConfig> = {};
  let projectConfig: Partial<SandboxConfig> = {};

  if (fsExistsSync(globalConfigPath)) {
    try {
      globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
    } catch (e) {
      console.error(
        `Warning: Could not parse ${globalConfigPath}: ${String(e)}`,
      );
    }
  }

  if (fsExistsSync(projectConfigPath)) {
    try {
      projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
    } catch (e) {
      console.error(
        `Warning: Could not parse ${projectConfigPath}: ${String(e)}`,
      );
    }
  }

  const config = deepMerge(
    deepMerge(DEFAULT_CONFIG, globalConfig),
    projectConfig,
  );

  const resolveDot = (paths: string[]) =>
    paths.map((p) => (p === "." ? cwd : p));

  return {
    ...config,
    filesystem: {
      ...config.filesystem,
      allowWrite: resolveDot(config.filesystem.allowWrite ?? []),
      allowRead: resolveDot(config.filesystem.allowRead ?? []),
      denyRead: resolveDot(config.filesystem.denyRead ?? []),
      denyWrite: resolveDot(config.filesystem.denyWrite ?? []),
    },
  };
}

export interface ShellConfig {
  shell: string;
  args: string[];
}

export function extractDomainsFromCommand(command: string): string[] {
  const urlRegex = /https?:\/\/([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const domains = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(command)) !== null) {
    if (match[1]) domains.add(match[1]);
  }
  return [...domains];
}

export function domainMatchesPattern(domain: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return domain === base || domain.endsWith("." + base);
  }
  return domain === pattern;
}

export function domainIsAllowed(
  domain: string,
  allowedDomains: string[],
): boolean {
  return allowedDomains.some((p) => domainMatchesPattern(domain, p));
}

export function allowsAllDomains(
  allowedDomains: string[] | undefined,
): boolean {
  return allowedDomains?.includes("*") ?? false;
}
export function extractBlockedWritePath(output: string): string | null {
  const match = output.match(
    /(?:\/bin\/bash|bash|sh): (?:line \d: )?(\/[^\s:]+): Operation not permitted/,
  );
  return match ? (match[1] ?? null) : null;
}

export function createSandboxedBashOps(
  getShellConfig: (shellPath?: string) => ShellConfig,
  shellPath?: string,
): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`);
      }

      const { shell, args } = getShellConfig(shellPath);
      const wrappedCommand = await SandboxManager.wrapWithSandbox(
        command,
        shell,
      );

      return new Promise((resolve, reject) => {
        const child = spawn(shell, [...args, wrappedCommand], {
          cwd,
          env,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                child.kill("SIGKILL");
              }
            }
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        const onAbort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}
