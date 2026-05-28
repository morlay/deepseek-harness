import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  toLang,
  expandRewrite,
  astGrep,
  astEdit,
  astFindInFiles,
} from "../index.ts";
import { Lang, parseAsync, type SgNode } from "@ast-grep/napi";
import { workingDir, type WorkingDir } from "deepseek-harness/testingutil";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("toLang", () => {
  it("undefined 默认 TypeScript", () =>
    expect(toLang(undefined)).toBe(Lang.TypeScript));

  it("空字符串默认 TypeScript", () => expect(toLang("")).toBe(Lang.TypeScript));

  it("typescript/ts → TypeScript", () => {
    expect(toLang("TypeScript")).toBe(Lang.TypeScript);
    expect(toLang("typescript")).toBe(Lang.TypeScript);
    expect(toLang("ts")).toBe(Lang.TypeScript);
    expect(toLang("TS")).toBe(Lang.TypeScript);
  });

  it("javascript/js/jsx → JavaScript", () => {
    expect(toLang("javascript")).toBe(Lang.JavaScript);
    expect(toLang("js")).toBe(Lang.JavaScript);
    expect(toLang("jsx")).toBe(Lang.JavaScript);
  });

  it("tsx → Tsx", () => expect(toLang("tsx")).toBe(Lang.Tsx));
  it("html → Html", () => expect(toLang("html")).toBe(Lang.Html));
  it("css → Css", () => expect(toLang("css")).toBe(Lang.Css));

  it("python → 自定义语言", () => expect(toLang("python")).toBe("Python"));

  it("未知语言作为自定义字符串", () => expect(toLang("ocaml")).toBe("ocaml"));
});

describe("expandRewrite", () => {
  it("替换单个 $ 变量", async () => {
    const root = await parseAsync(Lang.TypeScript, "const x = 1");
    const node = root.root().find("const $A = $B")!;
    expect(node).not.toBeNull();
    expect(expandRewrite("let $A = $B", node)).toBe("let x = 1");
  });

  it("未匹配的变量保持原样", async () => {
    const root = await parseAsync(Lang.TypeScript, "const x = 1");
    const node = root.root().find("const $A = 1")!;
    expect(expandRewrite("let $A = $MISSING", node)).toBe("let x = $MISSING");
  });

  it("无变量时原样返回", async () => {
    const root = await parseAsync(Lang.TypeScript, "const x = 1");
    const node = root.root().find("const $A = 1")!;
    expect(expandRewrite("no variables", node)).toBe("no variables");
  });

  it("$$$ 多节点参数展开", async () => {
    const root = await parseAsync(Lang.TypeScript, "function foo(a, b) {}");
    const node = root.root().find("function $NAME($$$ARGS) { $$$BODY }")!;

    const result = expandRewrite(
      "export function $NAME($$$ARGS) { $$$BODY }",
      node,
    );
    expect(result).toContain("export function foo");
  });
});

describe("astGrep (文件级搜索)", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("astgrep-test");
  });
  afterEach(async () => {
    await wd.cleanup();
  });

  it("搜索 TypeScript 常量声明", async () => {
    await wd.putFiles({
      "a.ts": "const x = 1\nconst y = 2\n",
      "b.ts": "let z = 3\n",
    });
    const matches = await astGrep("ts", {
      paths: [wd.root],
      pattern: "const $NAME = $VALUE",
    });
    expect(matches.length).toBe(2);

    expect(matches.map((m) => m.text)).toEqual(["const x = 1", "const y = 2"]);
  });

  it("返回 file:line:col 信息", async () => {
    await wd.putFiles({
      "main.ts": "import { foo } from 'bar'\nconst x = 1\nexport default x\n",
    });
    const matches = await astGrep("ts", {
      paths: [wd.root],
      pattern: "const $NAME = $VALUE",
    });
    expect(matches.length).toBe(1);
    expect(matches[0]!.line).toBe(2);
    expect(matches[0]!.text).toBe("const x = 1");
    expect(matches[0]!.file).toContain("main.ts");
  });

  it("无匹配返回空", async () => {
    await wd.putFiles({ "a.ts": "const x = 1\n" });
    const matches = await astGrep("ts", {
      paths: [wd.root],
      pattern: "function $F() {}",
    });
    expect(matches.length).toBe(0);
  });

  it("$$$ 通配符匹配函数", async () => {
    await wd.putFiles({
      "fn.ts": "function add(a: number, b: number): number { return a + b }\n",
    });
    const matches = await astGrep("ts", {
      paths: [wd.root],
      pattern: "function $NAME($$$PARAMS): $RET { $$$BODY }",
    });
    expect(matches.length).toBe(1);
    expect(matches[0]!.text).toContain("function add");
  });

  it("JavaScript 文件", async () => {
    await wd.putFiles({
      "app.js": "const app = express()\nmodule.exports = app\n",
    });
    const matches = await astGrep("javascript", {
      paths: [wd.root],
      pattern: "module.exports = $A",
    });
    expect(matches.length).toBe(1);
  });

  it("不存在的路径返回空", async () => {
    const matches = await astGrep("ts", {
      paths: ["/nonexistent"],
      pattern: "const $_ = $_",
    });
    expect(matches.length).toBe(0);
  });
});

describe("astEdit (文件级编辑)", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("astgrep-test");
  });
  afterEach(async () => {
    await wd.cleanup();
  });

  it("替换 const 为 let", async () => {
    const file = "a.ts";
    await wd.putFiles({ [file]: "const x = 1\nconst y = 2\n" });
    const results = await astEdit("ts", {
      paths: [wd.root],
      pattern: "const $NAME = $VALUE",
      rewrite: "let $NAME = $VALUE",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.count).toBe(2);

    const content = await readFile(resolve(wd.root, file), "utf-8");
    expect(content).toBe("let x = 1\nlet y = 2\n");
  });

  it("无匹配时返回空列表", async () => {
    await wd.putFiles({ "a.ts": "const x = 1\n" });
    const results = await astEdit("ts", {
      paths: [wd.root],
      pattern: "function $F() {}",
      rewrite: "export function $F() {}",
    });
    expect(results.length).toBe(0);
  });

  it("替换函数声明添加修饰", async () => {
    const file = "utils.ts";
    await wd.putFiles({
      [file]: "function foo() {}\nfunction bar() {}\n",
    });
    const results = await astEdit("ts", {
      paths: [wd.root],
      pattern: "function $NAME($$$ARGS) { $$$BODY }",
      rewrite: "export function $NAME($$$ARGS) { $$$BODY }",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.count).toBe(2);
    const content = await readFile(resolve(wd.root, file), "utf-8");
    expect(content).toContain("export function foo");
    expect(content).toContain("export function bar");
  });

  it("多文件编辑", async () => {
    await wd.putFiles({
      "src/a.ts": "const port = 3000\n",
      "src/b.ts": "const port = 8080\n",
    });
    const results = await astEdit("ts", {
      paths: [`${wd.root}/src`],
      pattern: "const port = $_",
      rewrite: "const port = 9999",
    });
    expect(results.length).toBe(2);
    for (const r of results) expect(r.count).toBe(1);
    const a = await readFile(resolve(wd.root, "src/a.ts"), "utf-8");
    const b = await readFile(resolve(wd.root, "src/b.ts"), "utf-8");
    expect(a).toBe("const port = 9999\n");
    expect(b).toBe("const port = 9999\n");
  });
});

describe("astFindInFiles (底层回调)", () => {
  let wd: WorkingDir;

  beforeEach(async () => {
    wd = await workingDir("astgrep-test");
  });
  afterEach(async () => {
    await wd.cleanup();
  });

  it("回调接收匹配节点", async () => {
    await wd.putFiles({ "code.ts": "const x = 1\nconst y = 2\n" });
    const nodes: SgNode[] = [];
    await astFindInFiles(
      "ts",
      { paths: [wd.root], pattern: "const $NAME = $VALUE" },
      (_err, n) => nodes.push(...n),
    );
    expect(nodes.length).toBe(2);
  });

  it("节点可获取文件名", async () => {
    await wd.putFiles({ "lib.ts": "export const X = 1\n" });
    const nodes: SgNode[] = [];
    await astFindInFiles(
      "ts",
      { paths: [wd.root], pattern: "export const $NAME = $_" },
      (_err, n) => nodes.push(...n),
    );
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.getRoot().filename()).toContain("lib.ts");
  });
});
