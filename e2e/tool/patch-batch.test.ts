import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createContext, createTempDir } from "deepseek-harness/testing";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2";

describe("patch-batch", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;
  let tmp: Awaited<ReturnType<typeof createTempDir>>;

  beforeAll(async () => {
    tmp = await createTempDir(import.meta.dirname!, "patch-batch");
    ctx = await createContext();
    session = await ctx.createSession({ directory: tmp.path });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await tmp.destroy();
  });

  it("批量修改两个文件 — fib 改名为 fibonacci", async () => {
    await tmp.putFiles({
      "lib/fib.py": `
def fib(n):
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)
`.trim(),
      "run.py": `
from lib.fib import fib

def main():
    print(fib(42))
`.trim(),
    });

    await ctx.promptText(
      session,
      "把 lib/fib.py 和 run.py 中的 fib 函数改名为 fibonacci，函数体内递归调用也要改",
    );

    const lib = await readFile(join(tmp.path, "lib/fib.py"), "utf-8");
    const run = await readFile(join(tmp.path, "run.py"), "utf-8");

    expect(lib).toContain("def fibonacci(n):");
    expect(lib).toContain("return fibonacci(n-1) + fibonacci(n-2)");
    expect(lib).not.toMatch(/\bdef fib\b/);
    expect(lib).not.toMatch(/\bfib\(/);

    expect(run).toContain("from lib.fib import fibonacci");
    expect(run).toContain("print(fibonacci(42))");
    // 不检查 /\bfib\b/ 因为会匹配到模块路径 lib.fib
    expect(run).not.toMatch(/\bimport fib\b/);
    expect(run).not.toMatch(/\bfib\(/);
  }, 120_000);

  it("单文件多处修改 — 将日志级别从 debug 改为 info 并更新所有引用", async () => {
    await tmp.putFiles({
      "logger.py": `
LOG_LEVEL = "debug"

def log(msg):
    if LOG_LEVEL == "debug":
        print(f"[DEBUG] {msg}")

def is_debug():
    return LOG_LEVEL == "debug"
`.trim(),
    });

    await ctx.promptText(
      session,
      "把 logger.py 里所有 debug 改成 info，包括变量值、注释、日志前缀和函数名",
    );

    const content = await readFile(join(tmp.path, "logger.py"), "utf-8");

    expect(content).toContain('LOG_LEVEL = "info"');
    expect(content).toContain('if LOG_LEVEL == "info":');
    expect(content).toContain("[INFO]");
    expect(content).toContain("def is_info():");
    expect(content).toContain('return LOG_LEVEL == "info"');
    expect(content).not.toMatch(/debug/i);
  }, 120_000);

  it("嵌套函数改名 — batch actions 覆盖定义和调用", async () => {
    await tmp.putFiles({
      "calc.py": `
def multiply(a, b):
    if a == 0 or b == 0:
        return 0
    return a * b

def square(x):
    return multiply(x, x)

def cube(x):
    return multiply(multiply(x, x), x)
`.trim(),
    });

    await ctx.promptText(
      session,
      "把 calc.py 里的 multiply 函数改名为 product，包括函数定义和所有调用处",
    );

    const content = await readFile(join(tmp.path, "calc.py"), "utf-8");

    expect(content).toContain("def product(a, b):");
    expect(content).toContain("return product(x, x)");
    expect(content).toContain("return product(product(x, x), x)");
    // 函数调用处不应残留旧名
    expect(content).not.toMatch(/\bmultiply\(/);
    // 不检查 /\bmultiply\b/ 因为注释或字符串中可能出现
  }, 120_000);
});
