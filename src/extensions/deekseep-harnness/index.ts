import {
  type ExtensionAPI,
  loadProjectContextFiles,
  loadSkills,
  getAgentDir,
  getShellConfig,
} from "@earendil-works/pi-coding-agent";
import {
  bashTool,
  findTool,
  readTool,
  grepTool,
  editTool,
  writeTool,
  moveTool,
  astgrepTool,
  asteditTool,
  webfetchTool,
} from "./tools/index.ts";

import {
  useTools,
  activeTools,
  buildSystemPrompt,
  loadSandboxConfig,
  SandboxManager,
  createSandboxedBashOps,
  checkFilesystemPath,
  checkShellCommand,
} from "deepseek-harness/pikit";

export default function (pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  let sandboxInitialized = false;
  let sandboxConfig: ReturnType<typeof loadSandboxConfig> | null = null;

  pi.on("before_agent_start", async (_evt, ctx) => {
    const contextFiles = loadProjectContextFiles({
      cwd: ctx.cwd,
      agentDir: agentDir,
    });

    const { skills } = loadSkills({
      cwd: ctx.cwd,
      agentDir: agentDir,
      skillPaths: ["~/.agents/skills", ".agents/skills"],
      includeDefaults: true,
    });

    const config = loadSandboxConfig(ctx.cwd, agentDir);

    sandboxConfig = config;
    
    if (
      config.network.allowedDomains?.length === 0 &&
      config.network.deniedDomains?.length === 0
    ) {
      delete (config.network as Record<string, unknown>).allowedDomains;
      delete (config.network as Record<string, unknown>).deniedDomains;
    }
    if (config.enabled !== false) {
      try {
        await SandboxManager.initialize(config);
        sandboxInitialized = true;
      } catch (e) {
        console.error(`Sandbox initialization failed: ${String(e)}`);
      
      if (
        config.network.allowedDomains === undefined &&
        config.network.deniedDomains === undefined
      ) {
        try {
          SandboxManager.updateConfig(config);
          sandboxInitialized = true;
          console.error("[sandbox] fallback succeeded, filesystem-only sandbox enabled");
        } catch (e2) {
          console.error(`Sandbox fallback also failed: ${String(e2)}`);
        }
      }
      }
    }

    useTools(
      pi,
      findTool(ctx.cwd),
      readTool(ctx.cwd),
      grepTool(ctx.cwd),
      editTool(ctx.cwd),
      writeTool(ctx.cwd),
      moveTool(ctx.cwd),
      astgrepTool(ctx.cwd),
      asteditTool(ctx.cwd),
      webfetchTool(),
      config.enabled !== false && sandboxInitialized
        ? bashTool(ctx.cwd, {
            operations: createSandboxedBashOps(getShellConfig),
          })
        : bashTool(ctx.cwd),
    );

    return {
      systemPrompt: buildSystemPrompt({
        prompt: `你是一名在 pi（一个编程代理框架）中运行的专家级编码助手。`,
        cwd: ctx.cwd,
        tools: activeTools(pi),
        skills: skills,
        contextFiles: contextFiles,
      }),
    };
  });

  pi.on("session_shutdown", async () => {
    if (sandboxInitialized) {
      try {
        await SandboxManager.reset();
      } catch {}
      sandboxInitialized = false;
    }
  });

  const fsTools = ["read", "edit", "write", "move", "grep", "find"];

  pi.on("tool_call", async (event, ctx) => {
    if (!fsTools.includes(event.toolName)) return undefined;

    const fs = sandboxConfig?.filesystem;
    if (!fs) return undefined;

    const input = event.input as { path?: string; newPath?: string };
    const path = input.path;
    if (!path) return undefined;

    
    if (event.toolName === "move") {
      const newPath = input.newPath;
      if (newPath && newPath !== "/dev/null") {
        const readResult = checkFilesystemPath(path, fs, "read");
        if (readResult.blocked) {
          if (ctx.hasUI) {
            ctx.ui.notify(readResult.reason ?? "路径被文件系统权限拒绝", "warning");
          }
          return { block: true, reason: readResult.reason };
        }
        const writeResult = checkFilesystemPath(newPath, fs, "write");
        if (writeResult.blocked) {
          if (ctx.hasUI) {
            ctx.ui.notify(writeResult.reason ?? "路径被文件系统权限拒绝", "warning");
          }
          return { block: true, reason: writeResult.reason };
        }
        return undefined;
      }
      
      const result = checkFilesystemPath(path, fs, "write");
      if (result.blocked) {
        if (ctx.hasUI) {
          ctx.ui.notify(result.reason ?? "路径被文件系统权限拒绝", "warning");
        }
        return { block: true, reason: result.reason };
      }
      return undefined;
    }

    const writeTools = new Set(["edit", "write"]);
    const operation = writeTools.has(event.toolName) ? "write" as const : "read" as const;

    const result = checkFilesystemPath(path, fs, operation);
    if (result.blocked) {
      if (ctx.hasUI) {
        ctx.ui.notify(result.reason ?? "路径被文件系统权限拒绝", "warning");
      }
      return { block: true, reason: result.reason };
    }

    return undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;
    const shell = sandboxConfig?.shell;
    if (!shell) return undefined;

    const command = (event.input as { command?: string }).command;
    if (!command) return undefined;

    const result = checkShellCommand(command, shell);
    if (!result.allowed) {
      if (ctx.hasUI) {
        ctx.ui.notify(result.reason ?? "Shell 命令被权限策略拒绝", "warning");
      }
      return { block: true, reason: result.reason };
    }

    return undefined;
  });
}
