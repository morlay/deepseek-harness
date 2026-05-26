# DeepSeek Harness

OpenCode 插件 — 为 DeepSeek 模型优化的自定义工具链，替代内置 grep/read/edit，提供 `LINE#HASH` 锚点体系。

```json
{ "plugin": ["github:morlay/deepseek-harness"] }
```

## 核心工具

| 工具 | 用途 |
|------|------|
| `hashgrep` | ripgrep 搜索，返回带锚点的结果 |
| `hashread` | 读取文件，每行带锚点 |
| `hashedit` | 跨文件批量编辑，消费锚点 |
| `astgrep` / `astedit` | AST 结构化搜索与改写 |

## 开发

```bash
just vitest src/hashline/__tests__/  # 引擎层
just vitest e2e/tool/                # 集成测试
```

详细架构与开发指南见 [DEVLOPING.md](./docs/DEVLOPING.md)。

参考：[Codex prompts](https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/protocol/src/prompts/base_instructions/default.md) · [pi-hashline-edit](https://github.com/can1357/oh-my-pi)





