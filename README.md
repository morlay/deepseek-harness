# DeepSeek Harness

为 DeepSeek 模型优化的 OpenCode 插件。

## 为什么

DeepSeek 在中文环境下表现更好。本插件汉化并精简所有内置工具描述，减少英文 prompt 干扰，让模型更自然地使用中文推理和输出。

同时弥补 opencode 内置工具在 DeepSeek 模型下的缺失（如 `patch` 不生效），提供 V4A diff 格式实现。

## 有什么

- **13 个工具汉化** — 描述和参数全部中文，行为说明基于实测验证
- **关键工具增强** — `patch` 支持 V4A diff 格式与批量操作；`sg` 含 AST pattern 示例；`write` 自动创建父目录
- **4 个 agent** — code、chat、doc（主 agent）+ worker（子 agent），prompt 精炼至最小必要约束
- **单元测试** — `tools/_internal/__tests__/` 验证 diff 解析等核心逻辑
- **e2e 测试** — 自然语言驱动，覆盖写/读/改/删/搜索/重构/shell/webfetch 全场景
- **透明代理** — 开发调试用，捕获 LLM API 请求/响应，SSE 合并落盘

详见 [GOAL.md](GOAL.md)、[PLAN.md](PLAN.md)、[docs/tools.md](docs/tools.md)、[docs/agents.md](docs/agents.md)、[docs/proxy.md](docs/proxy.md)、[docs/develop.md](docs/develop.md)。

## 怎么用

### 安装

```json
{
  "plugin": ["github:morlay/deepseek-harness"]
}
```

### 启用 LSP 工具

```bash
OPENCODE_EXPERIMENTAL_LSP_TOOL=1
```

## 继续阅读

- [GOAL.md](GOAL.md) — 项目设计、编码、文档规范
- [PLAN.md](PLAN.md) — 提示词与工具描述自迭代方案
- [工具定义与覆盖](docs/tools.md) — 内置工具汉化及自定义工具说明
- [Agent 定义](docs/agents.md) — 主 agent 与子 agent 的系统提示词和权限
- [透明代理](docs/proxy.md) — 开发调试用 LLM 请求捕获

## 参考文档

- [Codex prompts](https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/protocol/src/prompts/base_instructions/default.md)
- [Opencode tool](https://github.com/anomalyco/opencode/tree/dev/packages/opencode/src/tool)
