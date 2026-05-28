import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractDomainsFromCommand,
  domainMatchesPattern,
  domainIsAllowed,
  allowsAllDomains,
  extractBlockedWritePath,
  createSandboxedBashOps,
  SandboxManager,
  type SandboxRuntimeConfig,
} from "../sandbox";
import { getShellConfig } from "@earendil-works/pi-coding-agent";

describe("sandbox 纯函数", () => {
  describe("extractDomainsFromCommand", () => {
    it("从 curl 命令中提取域名", () => {
      const domains = extractDomainsFromCommand(
        "curl -s https://api.github.com/repos/test/repo",
      );
      expect(domains).toContain("api.github.com");
      expect(domains).toHaveLength(1);
    });

    it("提取多个域名", () => {
      const domains = extractDomainsFromCommand(
        "curl https://example.com && curl http://test.org/path",
      );
      expect(domains).toContain("example.com");
      expect(domains).toContain("test.org");
      expect(domains).toHaveLength(2);
    });

    it("去重相同域名", () => {
      const domains = extractDomainsFromCommand(
        "curl https://example.com/a && curl https://example.com/b",
      );
      expect(domains).toContain("example.com");
      expect(domains).toHaveLength(1);
    });

    it("没有 URL 时返回空数组", () => {
      expect(extractDomainsFromCommand("echo hello world")).toEqual([]);
    });
  });

  describe("domainMatchesPattern", () => {
    it("精确匹配域名", () => {
      expect(domainMatchesPattern("example.com", "example.com")).toBe(true);
      expect(domainMatchesPattern("example.com", "other.com")).toBe(false);
    });

    it("通配符 * 匹配所有域名", () => {
      expect(domainMatchesPattern("anything.com", "*")).toBe(true);
    });

    it("*.example.com 匹配子域名", () => {
      expect(domainMatchesPattern("api.example.com", "*.example.com")).toBe(
        true,
      );
      expect(domainMatchesPattern("example.com", "*.example.com")).toBe(true);
      expect(domainMatchesPattern("not-example.com", "*.example.com")).toBe(
        false,
      );
    });
  });

  describe("domainIsAllowed", () => {
    it("域名在允许列表中返回 true", () => {
      expect(domainIsAllowed("github.com", ["github.com", "npmjs.org"])).toBe(
        true,
      );
    });

    it("域名不在允许列表中返回 false", () => {
      expect(domainIsAllowed("evil.com", ["github.com"])).toBe(false);
    });

    it("空允许列表拒绝所有域名", () => {
      expect(domainIsAllowed("github.com", [])).toBe(false);
    });
  });

  describe("allowsAllDomains", () => {
    it("包含 * 时返回 true", () => {
      expect(allowsAllDomains(["*"])).toBe(true);
    });

    it("不包含 * 时返回 false", () => {
      expect(allowsAllDomains(["github.com"])).toBe(false);
    });

    it("undefined 时返回 false", () => {
      expect(allowsAllDomains(undefined)).toBe(false);
    });
  });

  describe("extractBlockedWritePath", () => {
    it("从 /bin/bash: line N: /path 格式中提取路径", () => {
      const result = extractBlockedWritePath(
        "/bin/bash: line 1: /etc/shadow: Operation not permitted",
      );
      expect(result).toBe("/etc/shadow");
    });

    it("提取 bash: 前缀格式的路径", () => {
      const result = extractBlockedWritePath(
        "bash: /root/.bashrc: Operation not permitted",
      );
      expect(result).toBe("/root/.bashrc");
    });

    it("提取 sh: 前缀格式的路径", () => {
      const result = extractBlockedWritePath(
        "sh: /protected/file.txt: Operation not permitted",
      );
      expect(result).toBe("/protected/file.txt");
    });

    it("无匹配时返回 null", () => {
      const result = extractBlockedWritePath("command not found");
      expect(result).toBeNull();
    });
  });
});

describe("createSandboxedBashOps", () => {
  let testDir: string;
  let sandboxConfig: SandboxRuntimeConfig;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "sandbox-test-"));

    sandboxConfig = {
      filesystem: {
        denyRead: ["/etc"],
        allowWrite: [testDir],
        denyWrite: [],
      },
      network: {
        allowedDomains: [],
        deniedDomains: [],
      },
    };

    await SandboxManager.initialize(sandboxConfig);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("沙箱内 echo 能正常执行", async () => {
    const ops = createSandboxedBashOps(getShellConfig);
    const outputChunks: Buffer[] = [];

    const result = await ops.exec("echo hello-sandbox", testDir, {
      onData: (data) => outputChunks.push(data),
    });

    expect(result.exitCode).toBe(0);
    const output = Buffer.concat(outputChunks).toString();
    expect(output).toContain("hello-sandbox");
  });

  it("沙箱内 ls 能正常工作", async () => {
    const testFile = join(testDir, "sandbox-test-file.txt");
    await writeFile(testFile, "sandbox content");

    const ops = createSandboxedBashOps(getShellConfig);
    const outputChunks: Buffer[] = [];

    const result = await ops.exec("ls -la", testDir, {
      onData: (data) => outputChunks.push(data),
    });

    expect(result.exitCode).toBe(0);
    const output = Buffer.concat(outputChunks).toString();
    expect(output).toContain("sandbox-test-file.txt");
  });

  it("cat denyRead 中的路径（/etc/hosts）应被沙箱阻止", async () => {
    const ops = createSandboxedBashOps(getShellConfig);
    const outputChunks: Buffer[] = [];

    const result = await ops.exec("cat /etc/hosts", testDir, {
      onData: (data) => outputChunks.push(data),
    });

    const output = Buffer.concat(outputChunks).toString();

    const isBlocked =
      result.exitCode !== 0 ||
      output.includes("Operation not permitted") ||
      output.includes("Permission denied");
    expect(isBlocked).toBe(true);
  });

  it("cwd 不存在时抛出错误", async () => {
    const ops = createSandboxedBashOps(getShellConfig);

    await expect(
      ops.exec("echo test", "/nonexistent/path/xyz", {
        onData: () => {},
      }),
    ).rejects.toThrow(/does not exist/i);
  });

  it("命令超时后应被终止", async () => {
    const ops = createSandboxedBashOps(getShellConfig);

    await expect(
      ops.exec("sleep 5", testDir, {
        onData: () => {},
        timeout: 1,
      }),
    ).rejects.toThrow(/timeout/i);
  }, 10_000);

  it("AbortSignal 可中止命令", async () => {
    const ops = createSandboxedBashOps(getShellConfig);
    const controller = new AbortController();

    setTimeout(() => controller.abort(), 500);

    await expect(
      ops.exec("sleep 5", testDir, {
        onData: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
  }, 10_000);
});
