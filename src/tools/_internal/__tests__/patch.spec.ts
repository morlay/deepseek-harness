import { describe, it, expect } from "vitest";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { tryRemoveEmptyDir, applyActions } from "../patch.ts";

describe("applyActions", () => {
  it("replace — 精确字符串替换", () => {
    const content = "const x = 0\nconst y = 1";
    const result = applyActions(content, [
      { replace: "const x = 1", old: "const x = 0" },
    ]);
    expect(result).toBe("const x = 1\nconst y = 1");
  });

  it("replace — 只替换第一次出现", () => {
    const content = "a b a b a";
    const result = applyActions(content, [{ replace: "X", old: "a" }]);
    // 只替换第一个 a
    expect(result).toBe("X b a b a");
  });

  it("replace — 找不到 old 时报错", () => {
    expect(() =>
      applyActions("hello", [{ replace: "x", old: "not found" }]),
    ).toThrow(/未找到替换文本/);
  });

  it("insert with after — 在指定行后插入", () => {
    const content = "import a\nimport b\n\ncode";
    const result = applyActions(content, [
      { insert: "import c", after: "import b" },
    ]);
    expect(result).toBe("import a\nimport b\nimport c\n\ncode");
  });

  it("insert without after — 追加到末尾", () => {
    const content = "line1\nline2";
    const result = applyActions(content, [{ insert: "line3" }]);
    expect(result).toBe("line1\nline2\nline3\n");
  });

  it("insert without after 到空内容 — 创建文件", () => {
    const result = applyActions("", [{ insert: "export const x = 1" }]);
    expect(result).toBe("export const x = 1\n");
  });

  it("多个操作顺序执行", () => {
    const content = "import a\n\nconst x = 0";
    const result = applyActions(content, [
      { insert: "import b", after: "import a" },
      { replace: "const x = 42", old: "const x = 0" },
    ]);
    expect(result).toBe("import a\nimport b\n\nconst x = 42");
  });
});

describe("tryRemoveEmptyDir", () => {
  it("删除文件后清理空目录", async () => {
    const base = resolve(tmpdir(), `patch-test-${Date.now()}`);
    const sub = resolve(base, "a", "b");
    await mkdir(sub, { recursive: true });
    const file = resolve(sub, "x.txt");
    await writeFile(file, "x");

    await unlink(file);
    await tryRemoveEmptyDir(sub, base);

    await expect(
      (async () => {
        try {
          const { readdir } = await import("node:fs/promises");
          await readdir(sub);
          return true;
        } catch {
          return false;
        }
      })(),
    ).resolves.toBe(false);

    await mkdir(sub, { recursive: true });
    await writeFile(resolve(sub, "y.txt"), "y");
    await tryRemoveEmptyDir(sub, base);
    const { readdir } = await import("node:fs/promises");
    await expect(readdir(sub)).resolves.toBeDefined();
  });
});
