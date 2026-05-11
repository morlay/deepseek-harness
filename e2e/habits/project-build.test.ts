import { describe, it, beforeAll, afterAll } from "vitest";
import { createContext } from "deepseek-harness/testing";
import type { Session } from "@opencode-ai/sdk/v2";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

const TMP = join(import.meta.dirname!, "..", ".tmp", "project-build");
const VITEST_BIN = join(
  import.meta.dirname!,
  "..",
  "..",
  "node_modules",
  ".bin",
  "vitest",
);

describe("project-build", () => {
  let ctx: Awaited<ReturnType<typeof createContext>>;
  let session: Session;

  beforeAll(async () => {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(join(TMP, "src"), { recursive: true });
    await mkdir(join(TMP, "__tests__"), { recursive: true });

    await writeFile(
      join(TMP, "package.json"),
      JSON.stringify(
        {
          name: "math-utils",
          type: "module",
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^4.1.7" },
        },
        null,
        2,
      ),
    );

    await writeFile(
      join(TMP, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            module: "esnext",
            moduleResolution: "bundler",
            target: "esnext",
            noEmit: true,
          },
          include: ["src", "__tests__"],
        },
        null,
        2,
      ),
    );

    // 有 bug 的源文件：返回类型声明为 string 但实际返回 number
    await writeFile(
      join(TMP, "src", "math.ts"),
      `
export function add(a: number, b: number): string {
  return a + b;
}
`.trim(),
    );

    // 测试文件引用了未实现的 multiply
    await writeFile(
      join(TMP, "__tests__", "math.test.ts"),
      `
import { describe, it, expect } from "vitest";
import { add, multiply } from "../src/math";

describe("math", () => {
  it("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });

  it("multiplies two numbers", () => {
    expect(multiply(3, 4)).toBe(12);
  });
});
`.trim(),
    );

    ctx = await createContext();
    session = await ctx.createSession({ directory: TMP });
  }, 60_000);

  afterAll(async () => {
    void ctx?.close();
    await rm(TMP, { recursive: true, force: true });
  });

  it("修复项目直到测试全部通过", async () => {
    await ctx.promptText(
      session,
      `这是一个数学工具库项目，src/math.ts 有类型错误（add 返回类型声明为 string 但实际返回 number），__tests__/math.test.ts 引用了一个还没实现的 multiply 函数。帮我把这些问题都修好。不需要你自己运行验证，代码改了就行。`,
    );

    // 等待 LLM 完成后，在项目目录下执行 vitest
    execSync(`${VITEST_BIN} run`, {
      cwd: TMP,
      stdio: "pipe",
      timeout: 60_000,
    });
  }, 180_000);
});
