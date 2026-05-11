# 工具

插件为 opencode 内置工具提供中文覆盖，并补充 2 个自定义工具。

## 内置工具

所有 opencode 内置工具的描述和参数通过 `"tool.definition"` hook 替换为中文。定义文件位于 `src/tools/`，使用 Effect Schema 描述参数结构。

| 工具        | 描述                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------- |
| `bash`      | 执行 bash 命令。默认使用当前工作目录，禁止 `cd`。构建/测试/lint 优先通过 `just` recipe。  |
| `edit`      | 精确字符串替换编辑已有文件。不能创建新文件，文件必须已存在。                              |
| `glob`      | 按 glob 模式匹配文件路径，结果按修改时间排序。默认在当前工作目录搜索。                    |
| `grep`      | 按正则搜索文件内容，返回匹配的文件路径和行号。                                            |
| `read`      | 读取文件内容或目录列表。                                                                  |
| `write`     | 全量覆写文件。父目录不存在时自动创建。                                                    |
| `webfetch`  | 获取 URL 内容，默认 markdown。自动 HTTP→HTTPS。                                           |
| `skill`     | 加载指定 skill 的指令和资源。                                                             |
| `task`      | 启动子 agent 并行处理多步骤任务。                                                         |
| `todowrite` | 管理结构化任务列表，跟踪会话进度。                                                        |
| `lsp`       | LSP 代码智能（需 `OPENCODE_EXPERIMENTAL_LSP_TOOL`）。支持跳转定义、查找引用、悬停信息等。 |

## 自定义工具

### patch

批量精确修改文件，用结构化 JSON 替代 diff 格式。支持替换、插入、重命名、删除，可一次处理多个文件。

- `calls: [{ filePath, actions: [{ replace, old } | { insert, after? }] }, { filePath, rename }, { filePath, delete: true }]` — 批量操作数组
- `replace` + `old` — 精确字符串匹配替换，`old` 为原文本、`replace` 为新文本
- `insert` + `after` — 在指定行后插入；`after` 为空时追加到末尾（文件不存在则创建）
- `rename` — 重命名/移动文件，`filePath` 为原路径、`rename` 为目标路径
- `delete: true` — 删除文件
- 通过 `_internal/patch.ts` 的 `applyActions` 执行，`tryRemoveEmptyDir` 辅助清理空目录

### sg

ast-grep 结构化搜索和改写。按 AST 模式匹配语法树，比 grep 更语义精准。

- 搜索：`pattern: "($$$PARAMS) => $BODY", lang: "typescript"`
- 改写：`pattern: "var $X = $Y", rewrite: "const $X = $Y", lang: "typescript"`
- Pattern 需与 AST 节点结构匹配，不吻合时返回空，可调整 pattern 重试

## 覆盖机制

`src/tools/index.ts` 中的 `applyOverwrites()` 函数统一处理内置工具的中文覆盖：hook 触发时将 Effect Schema 参数传给 opencode 转换为 JSON Schema。
