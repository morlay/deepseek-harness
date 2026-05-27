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
    const res = await hashread().execute({ filePath: fp, limit: 100 }, ctx);
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
      `export const add = (a, b) => a + b;
export const subtract = (a, b) => a - b;
`,
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
    await pf(
      "config.ts",
      `const host = 'localhost';
const port = 3000;
`,
    );

    const readResult = await r("config.ts");
    const lines = readResult.split("\n");
    const anchor1 = lines[0]!.match(/^(\d+#[A-Z]{2})/)![1]!;
    const anchor2 = lines[1]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "config.ts",
        edits: [
          {
            op: "replace",
            pos: anchor1,
            content: "const host = '0.0.0.0';",
          },
          {
            op: "replace",
            pos: anchor2,
            content: "const port = 8080;",
          },
        ],
      },
    ]);

    const content = await rf("config.ts");
    expect(content).toContain("0.0.0.0");
    expect(content).toContain("8080");
  });

  it("hashread offset/limit 按物理行窗口读取", async () => {
    const { pf, ctx } = await setupDir();
    await pf(
      "window.txt",
      `l1

l3
l4
l5
`,
    );
    const res = await hashread().execute(
      { filePath: "window.txt", offset: 2, limit: 3 },
      ctx,
    );
    const output = typeof res === "string" ? res : res.output;
    expect(output).not.toContain("1#");
    expect(output).toContain("3#");
    expect(output).toContain("4#");
    expect(output).not.toContain("5#");
  });

  it("hashgrep 跨文件返回完整文件块", async () => {
    const { pf, ctx } = await setupDir();
    await pf(
      "a.txt",
      `match one
match two
`,
    );
    await pf(
      "b.txt",
      `match three
match four
`,
    );
    const res = await hashgrep().execute({ pattern: "match" }, ctx);
    const output = typeof res === "string" ? res : res.output;
    const matchedLines = output
      .split("\n")
      .filter((line) => line.includes("#") && line.includes(":match"));
    expect(matchedLines).toHaveLength(4);
    expect(output).toContain("a.txt");
    expect(output).toContain("b.txt");
  });

  it("hashgrep 拒绝空 pattern", async () => {
    const { ctx } = await setupDir();
    await expect(hashgrep().execute({ pattern: "" }, ctx)).rejects.toThrow(
      /pattern 不能为空/,
    );
  });

  it("append 在锚点后追加, prepend 在锚点前插入", async () => {
    const { pf, rf, r, e } = await setupDir();
    await pf(
      "items.txt",
      `item1
item2
item3
`,
    );

    const readResult = await r("items.txt");
    const firstAnchor = readResult
      .split("\n")[0]!
      .match(/^(\d+#[A-Z]{2})/)![1]!;
    const lastAnchor = readResult.split("\n")[2]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "items.txt",
        edits: [
          { op: "append", pos: lastAnchor, content: "item4" },
          { op: "prepend", pos: firstAnchor, content: "header" },
        ],
      },
    ]);

    const content = await rf("items.txt");
    expect(content).toMatch(/^header/);
    expect(content).toContain("item4");
  });

  it("delete 删除行", async () => {
    const { pf, rf, r, e } = await setupDir();
    await pf(
      "del.txt",
      `keep
remove
keep
`,
    );

    const readResult = await r("del.txt");
    const anchor = readResult.split("\n")[1]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([{ filePath: "del.txt", edits: [{ op: "delete", pos: anchor }] }]);

    const content = await rf("del.txt");
    expect(content).not.toContain("remove");
    expect(content.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("新建文件：无锚点 append", async () => {
    const { rf, e } = await setupDir();
    await e([
      {
        filePath: "new.txt",
        edits: [
          { op: "append", content: "header" },
          { op: "append", content: "footer" },
        ],
      },
    ]);
    const content = await rf("new.txt");
    expect(content).toMatch(/header/);
    expect(content).toMatch(/footer/);
  });

  it("无效锚点不会被降级为无锚点", async () => {
    const { e } = await setupDir();
    await expect(
      e([
        {
          filePath: "end.txt",
          edits: [{ op: "append", pos: "end", content: "done=true" }],
        },
      ]),
    ).rejects.toThrow(/E_BAD_REF/);
  });
  it("跨文件批量编辑：一次调用改多文件", async () => {
    const { pf, rf, g, e } = await setupDir();
    await pf(
      "src/utils.ts",
      `export const add = (a, b) => a + b
export const sub = (a, b) => a - b
`,
    );
    await pf(
      "src/app.ts",
      `import { add, sub } from "./utils"
const r = sub(10, 5)
`,
    );
    await pf(
      "src/lib/calc.ts",
      `import { sub } from "../utils"
export const x = sub(100, 30)
`,
    );

    const grepResult = await g("\\bsub\\b");
    const anchors: { file: string; pos: string }[] = [];
    let currentFile = "";
    for (const line of grepResult.split("\n")) {
      const m = line.match(/^(\d+#[A-Z]{2}):/);
      if (m) {
        anchors.push({ file: currentFile, pos: m[1]! });
      } else if (line) {
        currentFile = line;
      }
    }
    expect(anchors.length).toBe(5);

    // 按文件分组锚点
    const grouped = new Map<string, string[]>();
    for (const a of anchors) {
      if (!grouped.has(a.file)) grouped.set(a.file, []);
      grouped.get(a.file)!.push(a.pos);
    }

    // 一次批量调用：每个锚点一条 replace
    const calls = [...grouped.entries()].map(([filePath, positions]) => ({
      filePath,
      edits: positions.map((pos) => ({
        op: "replace" as const,
        pos,
        content: "REPLACED",
      })),
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
    await pf(
      "old-name.ts",
      `export const x = 1;
`,
    );

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
    await pf(
      "keep.ts",
      `export const a = 1;
`,
    );
    await pf(
      "remove.ts",
      `export const b = 2;
`,
    );
    await pf(
      "old.ts",
      `export const c = 3;
`,
    );

    // 读取 keep.ts 获取第一行锚点
    const readResult = await r("keep.ts");
    const anchor = readResult.split("\n")[0]!.match(/^(\d+#[A-Z]{2})/)![1]!;

    await e([
      {
        filePath: "keep.ts",
        edits: [
          {
            op: "replace",
            pos: anchor,
            content: "export const a = 999;",
          },
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

// 复现：批量创建含语法错误的 .ts 文件后锚点是否仍然可用
it("hashedit 批量创建 .ts 文件后，锚点仍可用于后续编辑", async () => {
  const { rf, e, r } = await setupDir();

  // 批量创建 3 个 .ts 文件，其中一个描述含未转义双引号（语法错误）
  await e([
    {
      filePath: "src/a.ts",
      edits: [
        {
          op: "append" as const,
          content: `
export const a = () => ({
  description: "包含未转义: "x"",
})
`.trim(),
        },
      ],
    },
    {
      filePath: "src/b.ts",
      edits: [
        {
          op: "append" as const,
          content: `export const b = 1;
`,
        },
      ],
    },
    {
      filePath: "src/c.ts",
      edits: [
        {
          op: "append" as const,
          content: `export const c = 2;
`,
        },
      ],
    },
  ]);

  // 通过 hashread 获取 a.ts 的锚点
  const readResult = await r("src/a.ts");
  const anchor = readResult.split("\n")[0]!.match(/^(\d+#[A-Z]{2})/)![1]!;

  // 用该锚点做 replace
  await e([
    {
      filePath: "src/a.ts",
      edits: [
        {
          op: "replace" as const,
          pos: anchor,
          content: "export const a = 99;",
        },
      ],
    },
  ]);

  const content = await rf("src/a.ts");
  expect(content).toContain("export const a = 99");
});

// 复现：外部 readFile 读取文件后锚点是否漂移
it("外部 readFile 读取文件后，锚点不漂移", async () => {
  const { pf, rf, r, e } = await setupDir();

  await pf(
    "src/grep.ts",
    `
export const grep = (ctx) => ({
  description:
    "受 \`.gitignore\` 影响，示例: grep(pattern:\\"x\\", include:\\"*.ts\\")",
})
`.trim(),
  );

  const readResult = await r("src/grep.ts");
  const anchor = readResult.split("\n")[2]!.match(/^(\d+#[A-Z]{2})/)![1]!;

  // 模拟 oxlint 读取该文件（readFile 但不修改）
  await rf("src/grep.ts");

  // 用锚点修改，将双引号改为单引号
  await e([
    {
      filePath: "src/grep.ts",
      edits: [
        {
          op: "replace" as const,
          pos: anchor,
          content: `    "受 \`.gitignore\` 影响，示例: grep(pattern:'x', include:'*.ts')",`,
        },
      ],
    },
  ]);

  const content = await rf("src/grep.ts");
  expect(content).toContain("grep(pattern:'x'");
  expect(content).not.toContain(`grep(pattern:\\"x\\"`);
});
