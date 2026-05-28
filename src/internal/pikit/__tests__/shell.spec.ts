import { describe, it, expect } from "vitest";
import { checkShellCommand, type Shell } from "../shell";

describe("checkShellCommand", () => {
  const config: Shell = {
    allowMultiple: true,
    allowPipe: true,
    permissons: {
      "*": "deny",
      "echo *": "allow",
      "git *": "allow",
      "git push *": "deny",
      "git reset --hard": "deny",
      "ls *": "allow",
      "rg *": "allow",
    },
  };

  describe("基础匹配", () => {
    it("允许白名单中的命令", () => {
      const result = checkShellCommand("echo hello", config);
      expect(result.allowed).toBe(true);
    });

    it("拒绝未在白名单中的命令", () => {
      const result = checkShellCommand("curl https://example.com", config);
      expect(result.allowed).toBe(false);
    });

    it("拒绝通配符 * 匹配的 deny", () => {
      const result = checkShellCommand("unknown-command", config);
      expect(result.allowed).toBe(false);
    });
  });

  describe("具体性优先级", () => {
    it("git 允许但 git push 被更具体的 deny 覆盖", () => {
      const result = checkShellCommand("git push origin main", config);
      expect(result.allowed).toBe(false);
      expect(result.matchedPattern).toBe("git push *");
    });

    it("git reset 允许但 git reset --hard 被更具体的 deny 覆盖", () => {
      const result = checkShellCommand("git reset --hard HEAD~1", config);
      expect(result.allowed).toBe(false);
      expect(result.matchedPattern).toBe("git reset --hard");
    });

    it("git status 被 git * 允许（没有更具体的 deny）", () => {
      const result = checkShellCommand("git status", config);
      expect(result.allowed).toBe(true);
    });
  });

  describe("参数包含匹配", () => {
    it("命令参数包含 --hard 就算匹配 deny 模式", () => {
      const result = checkShellCommand(
        "git reset --hard --soft HEAD~1",
        config,
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedPattern).toBe("git reset --hard");
    });

    it("命令参数不包含 --hard 时不匹配", () => {
      const result = checkShellCommand("git reset --soft HEAD~1", config);
      expect(result.allowed).toBe(true);
    });
  });

  describe("多命令串联", () => {
    it("allowMultiple=true 时允许 A && B", () => {
      const result = checkShellCommand("echo hello && ls -la", config);
      expect(result.allowed).toBe(true);
    });

    it("allowMultiple=false 时拒绝 A && B", () => {
      const strictConfig: Shell = {
        ...config,
        allowMultiple: false,
      };
      const result = checkShellCommand("echo hello && ls -la", strictConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("多命令串联");
    });

    it("多命令中有一条被 deny 则整体拒绝", () => {
      const result = checkShellCommand(
        "echo hello && git push origin main",
        config,
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedPattern).toBe("git push *");
    });
  });

  describe("管道命令", () => {
    it("管道中的每条命令都做权限检查", () => {
      const result = checkShellCommand("ls -la | rg test", config);
      expect(result.allowed).toBe(true);
    });

    it("管道中有 deny 命令时拒绝", () => {
      const result = checkShellCommand("ls -la | git push origin main", config);
      expect(result.allowed).toBe(false);
    });

    it("allowPipe=false 时拒绝管道", () => {
      const noPipeConfig: Shell = { ...config, allowPipe: false };
      const result = checkShellCommand("ls -la | rg test", noPipeConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("管道");
    });
  });

  describe("引号处理", () => {
    it("带单引号参数的命令正确解析", () => {
      const configWithEcho: Shell = {
        allowMultiple: true,
        allowPipe: true,
        permissons: { "*": "deny", "echo *": "allow" },
      };
      const result = checkShellCommand("echo 'hello world'", configWithEcho);
      expect(result.allowed).toBe(true);
    });

    it("带双引号参数的命令正确解析", () => {
      const configWithEcho: Shell = {
        allowMultiple: true,
        allowPipe: true,
        permissons: { "*": "deny", "echo *": "allow" },
      };
      const result = checkShellCommand('echo "hello world"', configWithEcho);
      expect(result.allowed).toBe(true);
    });
  });
});
