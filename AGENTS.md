# AGENTS.md

OpenCode 插件，为 DeepSeek 模型汉化工具描述和优化 agent prompt。

## 环境

- Node >= 26，pnpm@11.1.3；lint 用 oxlint（非 ESLint），fmt 用 prettier
- 命令入口见 [justfile](justfile)：`just dep | vitest | oxlint | fmt | analyze-log`
- TypeScript noEmit，bundler module resolution，verbatimModuleSyntax
- 开发命令和测试指南见 [docs/develop.md](docs/develop.md)

## 架构

```
src/index.ts        # PluginModule 入口
  ├── agents/        # agent 定义，通过 config hook merge 注入
  │   └── _shared.ts # 共享 prompt 加载 + bash 权限规则
  ├── tools/
  │   ├── index.ts   # 11 个内置工具的描述汉化 (tool.definition hook)
  │   ├── sg.ts      # 自定义工具 (tool hook)，取代内置 sg
  │   ├── patch.ts   # 自定义工具 (tool hook)，结构化 JSON actions 代替 diff 格式
  │   └── _internal/ # patch 辅助函数 (applyActions, tryRemoveEmptyDir)
  └── testing/       # E2E 测试基础设施
      ├── proxy.ts    # LLM 请求代理，记录 request/response 到 logs/
      ├── context.ts  # 创建 opencode session 的工厂函数
      ├── helpers.ts  # 消息分析工具 (toolsCalled, reasoningText, hasEnglishSentence 等)
      └── tmp-dir.ts  # 临时目录管理
e2e/                 # E2E 测试，依赖真实 LLM API
  ├── tool/          # 7 个场景：工具参数/路径/pattern 正确性
  ├── quality/       # 2 个场景：中文 thinking、todowrite 使用
  └── habits/        # 1 个场景：修复 bug → vitest 通过（验证闭环）
```

## 插件 hook 职责

- **tool.definition**：覆盖内置工具的 description 和 parameters schema（汉化）。工具 ID 与文件名一一对应（`grep.ts` -> 覆盖 `grep`）。
- **tool**：注册 `sg`、`patch` 两个自定义工具，提供 execute 实现（DeepSeek 下 opencode 内置 patch 不生效）。
- **config**：用 `es-toolkit` 的 `merge` 向 code/chat/doc/worker 注入配置，是合并而非替换。

## 关键约定

- bash 权限在 `src/agents/_shared.ts:sharedBashPermission`，默认 deny，放行 `just *`/`rg`/`sg`/`git *`（排除 push/reset --hard）
- patch 使用结构化 JSON actions（`replace`/`old`、`insert`/`after`、`rename`、`delete`），通过 `applyActions` 执行，详见 [docs/patch.md](docs/patch.md)
- 工具描述必须反映实测行为而非文档假设，见 [PLAN.md](PLAN.md)
- 新增工具覆盖：先在 `tools/index.ts` 的 `overwrites` 中注册 tool ID，再创建对应 `.ts` 文件
