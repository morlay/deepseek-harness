# 开发指南

## 常用命令

所有命令通过 `just` 入口：

```
just dep        # 安装依赖 (pnpm install)
just vitest     # 运行测试 (pnpm exec vitest --run)
just oxlint     # 代码检查 (oxlint)
just fmt        # 格式化代码 (prettier -w -l)
just update     # 更新依赖到最新 (taze)
just clean      # 清理 node_modules + lock 文件
```

`just vitest` 可传参：`just vitest src/tools/_internal/__tests__` 只跑局部测试。

## 工具链顺序

每次变更的固定步骤：

1. `just fmt` — 格式化
2. `just oxlint` — 检查
3. `just vitest` — 测试

## 单元测试

位于 `src/tools/_internal/__tests__/`，覆盖 `applyActions` 等核心逻辑。

```bash
just vitest src/tools/_internal/__tests__
```

## E2E 测试

依赖真实 LLM API，位于 `e2e/`。需提前设置 API Key：

```bash
DEEPSEEK_API_KEY=sk-xxx just vitest e2e/
```

可选环境变量：

| 变量               | 默认值                     | 说明          |
| ------------------ | -------------------------- | ------------- |
| `E2E_PROVIDER`     | `deepseek`                 | 模型提供商    |
| `E2E_MODEL_ID`     | `deepseek-v4-flash`        | 模型 ID       |
| `E2E_UPSTREAM_URL` | `https://api.deepseek.com` | 上游 API 地址 |

### E2E 测试特点

- 每轮测试通过 SDK 的 `createOpencode` 启动独立 local server
- 使用透明代理（`LlmProxy`）捕获 LLM 请求/响应，合并 SSE 后落盘到 `logs/` 目录（已 .gitignore）
- `maxWorkers: 1` 串行执行
- 超时宽松：test 120s，hook 30s
- `OPENCODE_CONFIG_DIR=/tmp` 避免污染本地配置
- 只读工具（glob/grep/sg/bash/webfetch）验证工具调用次数；写工具验证文件最终状态

### 测试场景覆盖

| 测试文件                    | 覆盖场景                                       |
| --------------------------- | ---------------------------------------------- |
| `file-lifecycle.test.ts`    | 创建、读取、编辑、多行修改、删除文件，webfetch |
| `patch-delete.test.ts`      | 通过自然语言删除文件（patch delete）           |
| `patch-batch.test.ts`       | 批量多文件替换、单文件多处替换、嵌套函数改名   |
| `search-operations.test.ts` | glob、grep、sg 搜索与重构                      |
| `shell-operations.test.ts`  | bash 命令执行                                  |
| `project-build.test.ts`     | 修复类型错误、实现缺失函数（vitest run 验证）  |
