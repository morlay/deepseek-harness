import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hashread } from "../hashread.ts";
import { hashedit } from "../hashedit.ts";
import { hashgrep } from "../hashgrep.ts";
import type { ToolContext as TC } from "@opencode-ai/plugin/tool";

async function setupDir() {
  const dir = await mkdtemp(join(tmpdir(), "dh-hashop-"));
  const pf = async (rel: string, content: string) => {
    const p = join(dir, rel);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, content, "utf-8");
  };
  const rf = (rel: string) => readFile(join(dir, rel), "utf-8");
  const ctx = {
    directory: dir,
    worktree: dir,
    sessionID: "",
    messageID: "",
    agent: "",
    abort: new AbortController().signal,
  } as TC;
  const r = async (fp: string) => {
    const res = await hashread().execute({ filePath: fp }, ctx);
    return typeof res === "string" ? res : res.output;
  };
  const e = async (ops: any[]) => {
    await hashedit().execute({ ops }, ctx);
  };
  const g = async (pattern: string) => {
    const res = await hashgrep().execute({ pattern }, ctx);
    return typeof res === "string" ? res : res.output;
  };
  return { ctx, pf, rf, r, e, g };
}

describe("hashline 编辑闭环", () => {
  it("grep 搜索 → 用 hashline 锚点替换匹配行", async () => {
    const { pf, rf, e, g } = await setupDir();
    await pf(
      "src/utils.ts",
      "export const add = (a, b) => a + b;\nexport const subtract = (a, b) => a - b;\n",
    );

    const grepResult = await g("subtract");
    expect(grepResult).toMatch(/\d+#[A-Z]{2}:/);

    const anchor = grepResult.match(/(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "src/utils.ts",
        edits: [
          {
            op: "replace",
            pos: anchor,
            content: "export const minus = (a, b) => a - b;",
          },
        ],
      },
    ]);

    const content = await rf("src/utils.ts");
    expect(content).toContain("minus");
    expect(content).not.toContain("subtract");
  });

  it("read 获取锚点 → 批量替换两行", async () => {
    const { pf, rf, r, e } = await setupDir();
    await pf("config.ts", "const host = 'localhost';\nconst port = 3000;\n");

    const readResult = await r("config.ts");
    const lines = readResult.split("\n");
    const anchor1 = lines[0]!.match(/^(\d+#[A-Z]{2})/)![1]!;
    const anchor2 = lines[1]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "config.ts",
        edits: [
          { op: "replace", pos: anchor1, content: "const host = '0.0.0.0';" },
          { op: "replace", pos: anchor2, content: "const port = 8080;" },
        ],
      },
    ]);

    const content = await rf("config.ts");
    expect(content).toContain("0.0.0.0");
    expect(content).toContain("8080");
  });

  it("append 在锚点后追加, prepend 在文件头插入", async () => {
    const { pf, rf, r, e } = await setupDir();
    await pf("items.txt", "item1\nitem2\nitem3\n");

    const readResult = await r("items.txt");
    const anchor = readResult.split("\n")[2]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "items.txt",
        edits: [
          { op: "append", pos: anchor, content: "item4" },
          { op: "prepend", content: "header" },
        ],
      },
    ]);

    const content = await rf("items.txt");
    expect(content).toMatch(/^header/);
    expect(content).toContain("item4");
  });

  it("delete 删除行", async () => {
    const { pf, rf, r, e } = await setupDir();
    await pf("del.txt", "keep\nremove\nkeep\n");

    const readResult = await r("del.txt");
    const anchor = readResult.split("\n")[1]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([{ filePath: "del.txt", edits: [{ op: "delete", pos: anchor }] }]);

    const content = await rf("del.txt");
    expect(content).not.toContain("remove");
    expect(content.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("新建文件：无锚点 append/prepend", async () => {
    const { rf, e } = await setupDir();
    await e([
      {
        filePath: "new.txt",
        edits: [
          { op: "prepend", content: "header" },
          { op: "append", content: "footer" },
        ],
      },
    ]);
    const content = await rf("new.txt");
    expect(content).toMatch(/header/);
    expect(content).toMatch(/footer/);
  });

  it("新建文件：无效锚点 append 等同无锚点，可创建文件", async () => {
    const { rf, e } = await setupDir();
    await e([
      {
        filePath: "end.txt",
        edits: [{ op: "append", pos: "end", content: "done=true" }],
      },
    ]);
    const content = await rf("end.txt");
    expect(content).toBe("done=true");
  });
  it("跨文件批量编辑：一次调用改多文件", async () => {
    const { pf, rf, g, e } = await setupDir();
    await pf(
      "src/utils.ts",
      `export const add = (a, b) => a + b\nexport const sub = (a, b) => a - b\n`,
    );
    await pf(
      "src/app.ts",
      `import { add, sub } from "./utils"\nconst r = sub(10, 5)\n`,
    );
    await pf(
      "src/lib/calc.ts",
      `import { sub } from "../utils"\nexport const x = sub(100, 30)\n`,
    );

    const grepResult = await g("\\bsub\\b");
    const anchors: { file: string; pos: string }[] = [];
    for (const line of grepResult.split("\n")) {
      const m = line.match(/^([^:]+):(\d+#[A-Z]{2}):/);
      if (m) anchors.push({ file: m[1]!, pos: m[2]! });
    }
    expect(anchors.length).toBe(5);

    // 按文件分组锚点
    const grouped = new Map<string, string[]>();
    for (const a of anchors) {
      if (!grouped.has(a.file)) grouped.set(a.file, []);
      grouped.get(a.file)!.push(a.pos);
    }

    // 一次批量调用：每文件一条 replace，pos 用数组
    const calls = [...grouped.entries()].map(([filePath, positions]) => ({
      filePath,
      edits: [{ op: "replace" as const, pos: positions, content: "REPLACED" }],
    }));

    await e(calls);

    for (const f of ["src/utils.ts", "src/app.ts", "src/lib/calc.ts"]) {
      const content = await rf(f);
      expect(content, `${f} should contain REPLACED`).toContain("REPLACED");
      expect(content, `${f} should not contain sub`).not.toMatch(/\bsub\b/);
    }
  });

  it("rename 重命名文件", async () => {
    const { pf, rf, e } = await setupDir();
    await pf("old-name.ts", "export const x = 1;\n");

    await e([{ filePath: "old-name.ts", rename: "new-name.ts" }]);

    // 旧文件不存在
    let oldExists = true;
    try {
      await rf("old-name.ts");
    } catch {
      oldExists = false;
    }
    expect(oldExists).toBe(false);

    // 新文件存在且内容正确
    const content = await rf("new-name.ts");
    expect(content).toContain("export const x = 1");
  });

  it("跨文件混合操作：编辑 + 删除 + 重命名", async () => {
    const { pf, rf, r, e } = await setupDir();
    await pf("keep.ts", "export const a = 1;\n");
    await pf("remove.ts", "export const b = 2;\n");
    await pf("old.ts", "export const c = 3;\n");

    // 读取 keep.ts 获取第一行锚点
    const readResult = await r("keep.ts");
    const anchor = readResult.split("\n")[0]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "keep.ts",
        edits: [
          { op: "replace", pos: anchor, content: "export const a = 999;" },
        ],
      },
      { filePath: "remove.ts", delete: true },
      { filePath: "old.ts", rename: "new.ts" },
    ]);

    // keep.ts 已编辑
    expect(await rf("keep.ts")).toContain("999");

    // remove.ts 已删除
    let removed = true;
    try {
      await rf("remove.ts");
    } catch {
      removed = false;
    }
    expect(removed).toBe(false);

    // old.ts → new.ts
    let oldExists = true;
    try {
      await rf("old.ts");
    } catch {
      oldExists = false;
    }
    expect(oldExists).toBe(false);
    expect(await rf("new.ts")).toContain("export const c = 3");
  });
});
