import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  expandPath,
  canonicalizePath,
  matchesPattern,
  isPathDeniedForRead,
  isPathDeniedForWrite,
  shouldPromptForWrite,
  checkFilesystemPath,
} from "../filesystem";

describe("expandPath", () => {
  it("展开 ~ 为用户主目录", () => {
    const result = expandPath("~/test.txt");
    expect(result).toBe(resolve(homedir(), "test.txt"));
  });

  it("~ 单独使用时解析为用户主目录", () => {
    const result = expandPath("~");
    expect(result).toBe(homedir());
  });

  it("不以 ~ 开头时解析为绝对路径", () => {
    const result = expandPath("foo/bar");
    expect(result).toBe(resolve("foo/bar"));
  });

  it("已经是绝对路径时保持规范化", () => {
    const result = expandPath("/usr/local/bin");
    expect(result).toBe("/usr/local/bin");
  });
});

describe("canonicalizePath", () => {
  it("解析已存在的路径（macOS /var→/private/var 符号链接兼容）", () => {
    const p = tmpdir();
    expect(canonicalizePath(p)).toBe(canonicalizePath(p));
  });

  it("对不存在的路径向上查找最近存在的父目录后拼接", () => {
    const p = join(tmpdir(), "nonexistent", "deep", "file.txt");
    expect(canonicalizePath(p)).toBe(canonicalizePath(p));
  });

  it("展开 ~ 前缀", () => {
    const p = "~/nonexistent-path-xyz";
    expect(canonicalizePath(p)).toBe(canonicalizePath(p));
  });

  it("符号链接目录下的子路径应正确解析", () => {
    const result = canonicalizePath(join(tmpdir(), "test-file.txt"));
    expect(result).toBe(canonicalizePath(join(tmpdir(), "test-file.txt")));
  });
});

describe("matchesPattern", () => {
  it("路径完全匹配时返回 true", () => {
    expect(matchesPattern("/usr/local/bin", ["/usr/local/bin"])).toBe(true);
  });

  it("路径在目录前缀匹配时返回 true", () => {
    expect(matchesPattern("/usr/local/bin/node", ["/usr/local"])).toBe(true);
  });

  it("子目录文件匹配父目录模式", () => {
    expect(matchesPattern("/usr/local/bin/node", ["/usr"])).toBe(true);
  });

  it("路径不在模式内时返回 false", () => {
    expect(matchesPattern("/etc/passwd", ["/usr/local"])).toBe(false);
  });

  it("支持通配符 * 匹配", () => {
    expect(matchesPattern("/usr/local/bin/node", ["/usr/local/bin/*"])).toBe(
      true,
    );
    expect(matchesPattern("/usr/local/lib/somelib", ["/usr/local/bin/*"])).toBe(
      false,
    );
  });
  it("通配符 * 匹配子目录下的文件（.* 可匹配 /）", () => {
    expect(
      matchesPattern("/usr/local/bin/sub/node", ["/usr/local/bin/*"]),
    ).toBe(true);
  });

  it("空模式列表不匹配任何路径", () => {
    expect(matchesPattern("/tmp/file", [])).toBe(false);
  });

  it("目录前缀匹配（使用 resolve 规范化）", () => {
    const p = resolve("/usr/local");
    expect(matchesPattern(resolve("/usr/local/bin/node"), [p])).toBe(true);
  });

  it("以 / 结尾的模式匹配子路径", () => {
    expect(matchesPattern("/tmp/file.txt", ["/tmp/"])).toBe(true);
  });

  it("模式路径不以 / 结尾时也能匹配子路径", () => {
    expect(matchesPattern("/tmp/file.txt", ["/tmp"])).toBe(true);
  });
});

describe("isPathDeniedForRead", () => {
  it("路径在 denyRead 中时返回 true", () => {
    expect(isPathDeniedForRead("/etc/passwd", ["/etc"], [])).toBe(true);
  });

  it("路径不在 denyRead 中时返回 false", () => {
    expect(isPathDeniedForRead("/tmp/file", ["/etc"], [])).toBe(false);
  });

  it("denyRead 为空时返回 false", () => {
    expect(isPathDeniedForRead("/etc/passwd", [], [])).toBe(false);
  });

  it("在 denyRead 但在 allowRead 白名单中时放行", () => {
    expect(isPathDeniedForRead("/etc/passwd", ["/etc"], ["/etc/passwd"])).toBe(
      false,
    );
  });

  it("denyRead 中的子路径被 allowRead 放行", () => {
    expect(
      isPathDeniedForRead(
        "/Users/morlay/project/src/file.ts",
        ["/Users"],
        ["/Users/morlay/project"],
      ),
    ).toBe(false);
  });

  it("denyRead 中的路径不在 allowRead 中时仍拒绝", () => {
    expect(
      isPathDeniedForRead(
        "/Users/other/file.ts",
        ["/Users"],
        ["/Users/morlay/project"],
      ),
    ).toBe(true);
  });

  it("allowRead 为空时不影响 denyRead 判断", () => {
    expect(isPathDeniedForRead("/etc/passwd", ["/etc"], [])).toBe(true);
  });

  it("denyRead 空 + allowRead 非空时不拒绝（allowRead 不是黑名单）", () => {
    expect(isPathDeniedForRead("/tmp/file", [], ["/home"])).toBe(false);
  });
});

describe("isPathDeniedForWrite", () => {
  it("路径在 denyWrite 黑名单中时拒绝", () => {
    expect(isPathDeniedForWrite("/etc/passwd", ["/etc"], [])).toBe(true);
  });

  it("denyWrite 为空且 allowWrite 为空时不拒绝", () => {
    expect(isPathDeniedForWrite("/tmp/file", [], [])).toBe(false);
  });

  it("allowWrite 非空时，路径不在 allowWrite 中则拒绝", () => {
    expect(isPathDeniedForWrite("/etc/passwd", [], ["/tmp"])).toBe(true);
  });

  it("allowWrite 非空时，路径在 allowWrite 中则放行", () => {
    expect(isPathDeniedForWrite("/tmp/file", [], ["/tmp"])).toBe(false);
  });

  it("denyWrite 和 allowWrite 同时存在，denyWrite 优先", () => {
    expect(
      isPathDeniedForWrite("/tmp/secret.key", ["/tmp/secret.key"], ["/tmp"]),
    ).toBe(true);
  });

  it("allowWrite 的子路径也被允许", () => {
    expect(isPathDeniedForWrite("/tmp/sub/deep/file.txt", [], ["/tmp"])).toBe(
      false,
    );
  });

  it("通配符 denyWrite 匹配子路径文件", () => {
    const dir = resolve("/usr/local");
    expect(
      isPathDeniedForWrite(`${dir}/test.key`, [`${dir}/*.key`], [dir]),
    ).toBe(true);
  });
});

describe("shouldPromptForWrite", () => {
  it("allowWrite 为空时总是需要提示", () => {
    expect(shouldPromptForWrite("/tmp/file", [])).toBe(true);
  });

  it("路径在 allowWrite 内时不需要提示", () => {
    expect(shouldPromptForWrite("/tmp/file", ["/tmp"])).toBe(false);
  });

  it("路径不在 allowWrite 内时需要提示", () => {
    expect(shouldPromptForWrite("/etc/passwd", ["/tmp"])).toBe(true);
  });

  it("子路径在 allowWrite 内时不需要提示", () => {
    expect(shouldPromptForWrite("/tmp/sub/file", ["/tmp"])).toBe(false);
  });
});

describe("checkFilesystemPath", () => {
  const testDir = mkdtempSync(join(tmpdir(), "fs-check-test-"));
  const subFile = join(testDir, "sub", "file.txt");

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const fs = {
    denyRead: ["/etc"],
    allowRead: [testDir],
    denyWrite: ["*.key"],
    allowWrite: [testDir],
  };

  describe("读取校验（operation: read）", () => {
    it("路径在 denyRead 中且不在 allowRead 中时阻断", () => {
      const result = checkFilesystemPath("/etc/passwd", fs, "read");
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("不允许读取");
    });

    it("路径在 denyRead 中但在 allowRead 白名单中时放行", () => {
      const result = checkFilesystemPath(subFile, {
        ...fs,
        denyRead: [testDir],
        allowRead: [testDir],
      }, "read");
      expect(result.blocked).toBe(false);
    });

    it("路径不在 denyRead 中时放行", () => {
      const result = checkFilesystemPath("/tmp/ok.txt", fs, "read");
      expect(result.blocked).toBe(false);
    });

    it("denyRead 和 allowRead 都为空时放行", () => {
      const result = checkFilesystemPath("/any/path", {
        denyRead: [],
        allowRead: [],
        denyWrite: [],
        allowWrite: [],
      }, "read");
      expect(result.blocked).toBe(false);
    });
  });

  describe("写入校验（operation: write）", () => {
    it("路径在 denyWrite 中时阻断", () => {
      const dir = resolve("/usr/local");
      const result = checkFilesystemPath(`${dir}/secret.key`, {
        denyRead: [],
        allowRead: [],
        denyWrite: [`${dir}/*.key`],
        allowWrite: [dir],
      }, "write");
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("不允许写入");
    });

    it("路径不在 allowWrite 中时阻断", () => {
      const result = checkFilesystemPath("/etc/passwd", fs, "write");
      expect(result.blocked).toBe(true);
    });

    it("路径在 allowWrite 中且不在 denyWrite 中时放行", () => {
      const result = checkFilesystemPath(subFile, fs, "write");
      expect(result.blocked).toBe(false);
    });

    it("allowWrite 的子路径也放行", () => {
      const result = checkFilesystemPath(
        join(testDir, "deep/nested/file.txt"),
        fs,
        "write",
      );
      expect(result.blocked).toBe(false);
    });

    it("denyWrite 和 allowWrite 都为空时放行", () => {
      const result = checkFilesystemPath("/any/file", {
        denyRead: [],
        allowRead: [],
        denyWrite: [],
        allowWrite: [],
      }, "write");
      expect(result.blocked).toBe(false);
    });
  });
});
