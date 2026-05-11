/**
 * Benchmark: 自定义工具 vs opencode 内置工具
 *
 * 三场景 x 两模式对比：
 * 1. 文本搜索重命名 — hashgrep/hashread/hashedit vs grep/read/edit/patch
 * 2. AST 代码重构 — astgrep/astedit vs sg
 * 3. Bash 命令执行 — bash 行为对比
 */
import { describe, it, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { join, dirname } from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== 度量 ====================

interface RunResult {
  mode: string;
  scenario: string;
  chats: number;
  toolCalls: Record<string, number>;
  tokensInput: number;
  tokensOutput: number;
  failed: boolean;
  error?: string;
}

function extractTokens(msgs: any[]) {
  let input = 0;
  let output = 0;
  for (const m of msgs) {
    const t = (m as any).info?.tokens;
    if (t) {
      input += t.input ?? 0;
      output += t.output ?? 0;
    }
  }
  return { input, output };
}

function extractToolCalls(msgs: any[]): Record<string, number> {
  const calls: Record<string, number> = {};
  for (const m of msgs) {
    for (const p of m.parts ?? []) {
      if (p.type === "tool" && p.tool) {
        calls[p.tool] = (calls[p.tool] ?? 0) + 1;
      }
    }
  }
  return calls;
}

const BENCHMARK_LOG = join(__dirname, "..", "..", "logs", "benchmark.json");

// ==================== Runner ====================

async function runBenchmark(
  scenario: string,
  plugin: boolean,
  setup: () => Promise<{
    tmp: Awaited<ReturnType<typeof createTempDir>>;
    prompt: string;
    verify: () => Promise<void>;
  }>,
): Promise<RunResult> {
  const mode = plugin ? "plugin (custom)" : "builtin (opencode)";
  const result: RunResult = {
    mode,
    scenario,
    chats: 0,
    toolCalls: {},
    tokensInput: 0,
    tokensOutput: 0,
    failed: false,
  };

  const ctx = await createContext({ pluginEnabled: plugin });

  try {
    const { tmp, prompt, verify } = await setup();
    const session = await ctx.createSession({ directory: tmp.path });
    await ctx.promptText(session, prompt);

    const msgs = await ctx.messages(session);
    const tokens = extractTokens(msgs);
    result.chats = msgs.length;
    result.tokensInput = tokens.input;
    result.tokensOutput = tokens.output;
    result.toolCalls = extractToolCalls(msgs);

    await verify();
    await tmp.destroy();
  } catch (e: any) {
    result.failed = true;
    result.error = e instanceof Error ? e.message : JSON.stringify(e, null, 2);
  } finally {
    await ctx.close();
  }

  return result;
}

// ==================== 测试 ====================

describe("benchmark", () => {
  const results: RunResult[] = [];

  afterAll(async () => {
    const report = formatReport(results);
    console.log("\n" + report);
    await writeFile(BENCHMARK_LOG, JSON.stringify(results, null, 2), "utf-8");
    console.log(`\n详细数据: ${BENCHMARK_LOG}`);
  });

  // --- Scenario 1: 跨文件文本重命名（复杂场景） ---

  const TEXT_RENAME_FILES: Record<string, string> = {
    "src/utils/math.ts":
      "export const add = (a: number, b: number) => a + b\n" +
      "export const subtract = (a: number, b: number) => a - b\n" +
      "export const multiply = (a: number, b: number) => a * b\n" +
      "export const divide = (a: number, b: number) => a / b\n",
    "src/utils/ops.ts":
      'export { add, subtract, multiply, divide } from "./math"\n',
    "src/app.ts":
      'import { add, subtract } from "./utils/ops"\n' +
      "const a = add(10, 5)\n" +
      "const b = subtract(20, 5)\n" +
      "console.log(a, b)\n",
    "src/lib/calc.ts":
      'import { subtract } from "../utils/ops"\n' +
      "export const diff = subtract(100, 30)\n",
    "src/lib/report.ts":
      'import { subtract } from "../utils/ops"\n' +
      "export const summary = `result: ${subtract(50, 10)}`\n",
  };

  function textRenameVerify(
    tmp: Awaited<ReturnType<typeof createTempDir>>,
  ): () => Promise<void> {
    return async () => {
      for (const [path] of Object.entries(TEXT_RENAME_FILES)) {
        const content = await tmp.readFile(path);
        if (!content.includes("minus"))
          throw new Error(`${path}: minus not found`);
        if (content.includes("subtract"))
          throw new Error(`${path}: subtract still present`);
      }
    };
  }

  it("S1: 文本重命名(跨文件) — plugin", { timeout: 120_000 }, async () => {
    results.push(
      await runBenchmark("text-rename", true, async () => {
        const tmp = await createTempDir(import.meta.dirname!, "b1-plugin");
        await tmp.putFiles(TEXT_RENAME_FILES);
        return {
          tmp,
          prompt:
            "代码里有个 subtract 函数名字不太好，帮我全部改成 minus，src/ 下所有用到的地方都要改干净。",
          verify: textRenameVerify(tmp),
        };
      }),
    );
  });

  it("S1: 文本重命名(跨文件) — builtin", { timeout: 120_000 }, async () => {
    results.push(
      await runBenchmark("text-rename", false, async () => {
        const tmp = await createTempDir(import.meta.dirname!, "b1-builtin");
        await tmp.putFiles(TEXT_RENAME_FILES);
        return {
          tmp,
          prompt:
            "代码里有个 subtract 函数名字不太好，帮我全部改成 minus，src/ 下所有用到的地方都要改干净。",
          verify: textRenameVerify(tmp),
        };
      }),
    );
  });

  // --- Scenario 2: AST 代码重构 ---

  it("S2: AST const→let — plugin", { timeout: 120_000 }, async () => {
    results.push(
      await runBenchmark("ast-refactor", true, async () => {
        const tmp = await createTempDir(import.meta.dirname!, "b2-plugin");
        await tmp.putFiles({
          "src/math.ts": `export const PI = 3.14;\nexport const E = 2.718;\n`,
        });
        return {
          tmp,
          prompt:
            "src/math.ts 里的 const 声明改成 let，先用 astedit dryRun 预览，确认后执行。",
          verify: async () => {
            const c = await tmp.readFile("src/math.ts");
            if (!c.includes("let PI") || c.includes("const PI"))
              throw new Error("not refactored");
          },
        };
      }),
    );
  });

  it("S2: AST const→let — builtin", { timeout: 120_000 }, async () => {
    results.push(
      await runBenchmark("ast-refactor", false, async () => {
        const tmp = await createTempDir(import.meta.dirname!, "b2-builtin");
        await tmp.putFiles({
          "src/math.ts": `export const PI = 3.14;\nexport const E = 2.718;\n`,
        });
        return {
          tmp,
          prompt: "src/math.ts 里的 const 声明改成 let。",
          verify: async () => {
            const c = await tmp.readFile("src/math.ts");
            if (!c.includes("let PI") || c.includes("const PI"))
              throw new Error("not refactored");
          },
        };
      }),
    );
  });

  // --- Scenario 3: Bash 执行 ---

  it("S3: Bash ls — plugin", { timeout: 90_000 }, async () => {
    results.push(
      await runBenchmark("bash-ls", true, async () => {
        const tmp = await createTempDir(import.meta.dirname!, "b3-plugin");
        await tmp.putFiles({ "a.ts": "1", "b.ts": "2" });
        return {
          tmp,
          prompt: "用 bash ls 看下当前目录有哪些 .ts 文件",
          verify: async () => {},
        };
      }),
    );
  });

  it("S3: Bash ls — builtin", { timeout: 90_000 }, async () => {
    results.push(
      await runBenchmark("bash-ls", false, async () => {
        const tmp = await createTempDir(import.meta.dirname!, "b3-builtin");
        await tmp.putFiles({ "a.ts": "1", "b.ts": "2" });
        return {
          tmp,
          prompt: "用 bash ls 看下当前目录有哪些 .ts 文件",
          verify: async () => {},
        };
      }),
    );
  });
});

// ==================== 报告 ====================

function formatReport(results: RunResult[]): string {
  const lines: string[] = [
    "=".repeat(72),
    "  Benchmark: custom tools vs opencode built-in",
    "=".repeat(72),
  ];

  const scenarios = [...new Set(results.map((r) => r.scenario))];

  for (const scenario of scenarios) {
    const plugin = results.find(
      (r) => r.scenario === scenario && r.mode.includes("plugin"),
    )!;
    const builtin = results.find(
      (r) => r.scenario === scenario && r.mode.includes("builtin"),
    )!;
    if (!plugin || !builtin) continue;

    lines.push(`\n## ${scenario}`);
    lines.push("");
    lines.push("| 指标 | plugin (custom) | builtin (opencode) |");
    lines.push("|------|-----------------|--------------------|");

    const pOk = plugin.failed ? "FAIL" : "OK";
    const bOk = builtin.failed ? "FAIL" : "OK";
    lines.push(`| 状态 | ${pOk} | ${bOk} |`);

    const pTotal = plugin.tokensInput + plugin.tokensOutput;
    const bTotal = builtin.tokensInput + builtin.tokensOutput;
    const diff =
      bTotal > 0 ? `${((pTotal / bTotal - 1) * 100).toFixed(0)}%` : "N/A";
    const delta = pTotal - bTotal;
    lines.push(
      `| Tokens (I+O) | ${pTotal} (I:${plugin.tokensInput} O:${plugin.tokensOutput}) | ${bTotal} (I:${builtin.tokensInput} O:${builtin.tokensOutput}) |`,
    );
    lines.push(
      `| vs baseline | ${delta > 0 ? "+" : ""}${delta} (${diff}) | baseline |`,
    );

    lines.push(`| Chat rounds | ${plugin.chats} | ${builtin.chats} |`);

    const pTools = Object.entries(plugin.toolCalls)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    const bTools = Object.entries(builtin.toolCalls)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    const pCount = Object.values(plugin.toolCalls).reduce((a, b) => a + b, 0);
    const bCount = Object.values(builtin.toolCalls).reduce((a, b) => a + b, 0);
    lines.push(
      `| Tool calls (${pCount} vs ${bCount}) | ${pTools} | ${bTools} |`,
    );

    if (plugin.failed) lines.push(`| Error | ${plugin.error} | |`);
    if (builtin.failed) lines.push(`| Error | | ${builtin.error} |`);
  }

  // Summary
  const pAll = results.filter((r) => r.mode.includes("plugin"));
  const bAll = results.filter((r) => r.mode.includes("builtin"));

  if (pAll.length === bAll.length) {
    lines.push("\n## Summary");
    const pOk = pAll.filter((r) => !r.failed).length;
    const bOk = bAll.filter((r) => !r.failed).length;
    const pTok = pAll.reduce((s, r) => s + r.tokensInput + r.tokensOutput, 0);
    const bTok = bAll.reduce((s, r) => s + r.tokensInput + r.tokensOutput, 0);
    const pCalls = pAll.reduce(
      (s, r) => s + Object.values(r.toolCalls).reduce((a, b) => a + b, 0),
      0,
    );
    const bCalls = bAll.reduce(
      (s, r) => s + Object.values(r.toolCalls).reduce((a, b) => a + b, 0),
      0,
    );

    lines.push(
      `Success: ${pOk}/${pAll.length} plugin vs ${bOk}/${bAll.length} builtin`,
    );
    lines.push(
      `Total tokens: ${pTok} plugin vs ${bTok} builtin (${bTok > 0 ? ((pTok / bTok - 1) * 100).toFixed(0) : "N/A"}%)`,
    );
    lines.push(`Total tool calls: ${pCalls} plugin vs ${bCalls} builtin`);
  }

  return lines.join("\n");
}
