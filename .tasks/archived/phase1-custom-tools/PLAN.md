# Phase 1 自定义工具实现

## 状态：已完成

| 模块                          | 状态                                                            |
| ----------------------------- | --------------------------------------------------------------- | ----------- |
| `src/hashline/` 引擎          | ✅ 35 tests                                                     |
| `src/astgrep/` 引擎           | ✅ toLang + astFindInFiles                                      |
| `src/core/tools/hashread`     | ✅ 实现 + description                                           |
| `src/core/tools/hashedit`     | ✅ 实现 + description, 支持跨文件批量 { ops: [{ filePath, edits | delete }] } |
| `src/core/tools/hashgrep`     | ✅ 实现 + description                                           |
| `src/core/tools/astgrep`      | ✅ 实现 + description                                           |
| `src/core/tools/astedit`      | ✅ 实现 + description                                           |
| `src/core/index.ts` 插件入口  | ✅ tool hook + tool.definition + AgentConfig merge              |
| 行为测试 (hashop 6 + astop 3) | ✅ 9 tests                                                      |
| e2e/tool 测试                 | ✅ 28 tests                                                     |
| oxlint                        | ✅ 0/0                                                          |
| vitest (单元)                 | ✅ 44/44                                                        |

## 工具 API 设计

| 工具       | 参数                                          | 用途                                         |
| ---------- | --------------------------------------------- | -------------------------------------------- | ----------------------------- |
| `hashgrep` | `{ pattern, path?, include? }`                | 正则搜索，返回 `file:LINE#HASH:content` 锚点 |
| `hashread` | `{ filePath, offset?, limit? }`               | 读文件/目录，返回 `LINE#HASH: CONTENT` 锚点  |
| `hashedit` | `{ ops: [{ filePath, edits                    | delete }] }`                                 | 跨文件批量编辑+删除，锚点定位 |
| `astgrep`  | `{ pattern, lang?, path? }`                   | AST 搜索，返回 `file:line:col: text`         |
| `astedit`  | `{ pattern, rewrite, lang?, path?, dryRun? }` | AST 改写，dryRun 预览                        |

## 目录结构

```
src/
  hashline/          # 引擎层：hash 计算、锚点格式、applyEdits
  astgrep/           # 引擎层：toLang + astFindInFiles 封装
  core/tools/        # 工具层：openCode tool 注册
  core/agents/       # Agent prompt (code.md, tool-use.md)
```
