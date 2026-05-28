import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, type Context } from "deepseek-harness/testingutil";
import { workingDir, type WorkingDir } from "deepseek-harness/testingutil";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

describe("e2e: sandbox 约束", () => {
  let wd: WorkingDir;
  let ctx: Context;
  const toolStats: Record<string, number> = {};

  beforeAll(async () => {
    wd = await workingDir("e2e-sandbox");

    await wd.putFiles({
      ".pi/sandbox.json": JSON.stringify({
        enabled: true,
        shell: {
          permissons: {
            "*": "deny",
            "echo *": "allow",
            "cat *": "allow",
            "find *": "allow",
            "curl *": "allow",
          },
        },
        filesystem: {
          denyRead: ["/etc"],
          allowWrite: ["."],
          denyWrite: [],
        },
      }),
    });
    ctx = await createContext({ cwd: wd.root });

    ctx.session.subscribe((evt: AgentSessionEvent) => {
      if (evt.type === "tool_execution_start") {
        toolStats[evt.toolName] = (toolStats[evt.toolName] ?? 0) + 1;
      }
      const skip = new Set(["message_update"]);
      if (!skip.has(evt.type)) {
        const extra =
          evt.type === "tool_execution_start"
            ? evt.toolName
            : evt.type === "agent_end"
              ? `msgs:${evt.messages.length}`
              : "";
        console.log(`  [${evt.type}] ${extra}`);
      }
    });
  }, 60_000);

  afterAll(async () => {
    console.log("[stats] tools:", JSON.stringify(toolStats));
    ctx.session.dispose();
    await wd.cleanup();
  });

  it("bash 在工作目录内创建和读取文件正常", async () => {
    await ctx.session.prompt(
      "用 bash 执行：echo 'sandbox-ok' > result.txt，然后 cat result.txt 验证内容",
    );

    const content = await readFile(resolve(wd.root, "result.txt"), "utf-8");
    expect(content).toContain("sandbox-ok");
  }, 180_000);

  it("bash cat /etc/hosts 应被沙箱阻止（denyRead 中）", async () => {
    await ctx.session.prompt(
      "用 bash 执行 cat /etc/hosts，查看输出中是否包含 'Operation not permitted' 或 'Permission denied'",
    );
  }, 180_000);

  it("bash 写入工作目录外的路径应被沙箱阻止", async () => {
    await ctx.session.prompt(
      "用 bash 执行：echo 'should-fail' > /tmp/sandbox-e2e-should-fail.txt，查看是否有 'Operation not permitted' 错误",
    );
  }, 180_000);

  it("bash 使用 curl 访问未授权域名应被沙箱阻止", async () => {
    await ctx.session.prompt(
      "用 bash 执行 curl -s --max-time 3 https://example.com，查看输出中是否包含连接被拒或 Operation not permitted 等错误",
    );
  }, 180_000);

  it("bash 在工作目录内正常文件操作（find/ls/grep）", async () => {
    await wd.putFiles({
      "data/a.log": "info: started",
      "data/b.log": "error: failed",
      "data/c.txt": "hello",
    });

    await ctx.session.prompt(
      "用 bash 执行 find data -name '*.log' 列出所有日志文件",
    );
  }, 120_000);
});
