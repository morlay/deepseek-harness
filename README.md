# DeepSeek Harness

OpenCode 插件，用自定义工具替换 opencode 内置工具，针对 DeepSeek 模型优化。

## 做了什么

**替换 opencode 内置工具为自定义实现：**

| 内置工具               | 自定义工具            | 实现方式                                 |
| ---------------------- | --------------------- | ---------------------------------------- |
| `grep`                 | `hashgrep`            | ripgrep + hashline 锚点                  |
| `read`                 | `hashread`            | ripgrep + hashline 锚点                  |
| `edit` / `apply_patch` | `hashedit`            | hashline 锚点批量编辑，跨文件 `ops` 数组 |
|                        | `astgrep` / `astedit` | @ast-grep/napi 封装                      |

**保留的开源内置工具：** `glob`、`write`、`bash`、`lsp`、`skill`、`task`、`todowrite`、`webfetch`

**hashline 锚点系统：** 借鉴 [oh-my-pi](https://github.com/can1357/oh-my-pi)，每行内容附带 `LINE#HASH` 唯一锚点，`hashgrep` 搜索结果直接传给 `hashedit` 编辑，无需先读后改。锚点过期时自动模糊匹配恢复。

## 架构

```
src/
  hashline/    # 引擎：hash 计算、锚点格式、applyEdits
  astgrep/     # 引擎：@ast-grep/napi 封装
  core/
    tools/     # 工具注册（5 个自定义工具）
    agents/    # Agent prompt（code.md、tool-use.md）
    index.ts   # 插件入口
  testing/     # E2E 测试基础设施
```

## 安装

```json
{ "plugin": ["github:morlay/deepseek-harness"] }
```

## 开发

```bash
just dep         # 安装依赖
just vitest      # 单元测试
just vitest e2e/ # E2E 测试（需 DEEPSEEK_API_KEY）
```

## 参考

- [Codex prompts](https://raw.githubusercontent.com/openai/codex/refs/heads/main/codex-rs/protocol/src/prompts/base_instructions/default.md)
- [Opencode tool](https://github.com/anomalyco/opencode/tree/dev/packages/opencode/src/tool)
- [oh-my-pi](https://github.com/can1357/oh-my-pi)
