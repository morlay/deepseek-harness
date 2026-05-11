import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 30_000,
    maxWorkers: 1,

    env: {
      // 移除，避免 agent 测试时污染环境
      OPENCODE_SERVER_USERNAME: "",
      OPENCODE_SERVER_PASSWORD: "",

      // LSP 开启
      OPENCODE_EXPERIMENTAL_LSP_TOOL: "1",
    },
  },
});
