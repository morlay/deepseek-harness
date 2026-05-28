# Deekseep harnness

基于 [pi](https://pi.dev/) 的自定义 coding agent，提供中文工具描述和增强的文件操作工具。

## 工具

### read — 读取文件

读取文件内容，支持文本和图片（jpg/png/gif/webp）。文本输出按行数或大小自动截断，大文件用 `offset`/`limit` 分段读取。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件路径（相对或绝对） |
| `offset` | number? | 起始行号，从 1 开始 |
| `limit` | number? | 最大读取行数 |

> 使用 read 而不是 bash(cat/bat/sed)。目录列表请用 find。

### grep — 正则搜索

正则搜索文本（ripgrep），遵守 `.gitignore`。按文件拆分返回匹配行（`file:line: content`）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `pattern` | string | 正则匹配模式（PCRE），或 `literal: true` 时作为字面字符串 |
| `path` | string? | 搜索目录或文件，默认当前目录 |
| `glob` | string? | 文件过滤，如 `*.ts` 或 `**/*.spec.ts` |
| `ignoreCase` | boolean? | 忽略大小写 |
| `literal` | boolean? | 将 pattern 视为字面字符串而非正则 |
| `context` | number? | 匹配行前后各显示的行数 |
| `limit` | number? | 最大匹配数 |

> 使用 grep 而不是 bash(rg)。

### edit — 精确替换

精确替换文件内容（`oldText`/`newText`）。每个 `oldText` 必须在原始文件中唯一、不重叠地匹配。支持单文件多处非重叠编辑。不匹配时抛出错误。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件路径 |
| `edits` | { oldText, newText }[] | 一次或多次精确替换，基于原始文件匹配，非增量式 |

> 邻近或重叠的改动合并为一次 edit。`oldText` 尽量简短但保持唯一。创建新文件或整体覆盖用 write。

### write — 创建/覆盖

创建或覆盖文件。文件不存在时自动创建（含父目录），存在时整体覆盖。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件路径 |
| `content` | string | 要写入的完整内容 |

> 新建文件或整体覆盖用 write，精确修改用 edit。

### move — 移动/重命名/删除

移动或重命名文件。目标父目录不存在时自动创建。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 源文件路径 |
| `newPath` | string | 目标路径。设为 `/dev/null` 时删除文件 |

> 返回 `M <path> -> <newPath>`（移动）或 `D <path>`（删除）。

### find — 搜索文件

按 glob 模式搜索文件，遵守 `.gitignore`。返回匹配文件的相对路径列表。

| 参数 | 类型 | 说明 |
|------|------|------|
| `pattern` | string | glob 模式，如 `*.ts`、`**/*.json` |
| `path` | string? | 搜索目录 |
| `limit` | number? | 最大结果数 |

> 使用 find 而不是 bash(find/fd)。

### bash — 执行命令

在当前工作目录执行命令，返回 stdout 和 stderr。内置 OS 级沙箱约束文件系统和网络访问。Shell 命令通过权限策略校验（默认拒绝所有命令，需在沙箱配置中显式允许）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `command` | string | 要执行的单条命令 |
| `timeout` | number? | 超时秒数 |

> 内置工具能解决的问题，请勿使用 bash。禁止 `&&`、`;` 多命令串联。

### astgrep — AST 搜索

AST 模式搜索代码结构，不受格式/空格干扰。使用 `$NAME` 匹配标识符，`$$$NAME` 匹配多节点。

| 参数 | 类型 | 说明 |
|------|------|------|
| `pattern` | string | AST 匹配模式 |
| `lang` | string? | 解析语言（ts/js/css/go/rust/python…） |
| `path` | string? | 搜索的目录或文件 |

### astedit — AST 改写

AST 结构化改写。pattern 搜索匹配，rewrite 替换（`$` 变量展开为匹配到的原值）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `pattern` | string | AST 匹配模式 |
| `rewrite` | string | 替换模板，使用相同的 `$` 变量 |
| `lang` | string? | 解析语言 |
| `path` | string? | 搜索的目录或文件 |

### webfetch — 获取网页

获取指定 URL 的内容，自动 HTML→Markdown 转换（基于 Content-Type 判断）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string | 要获取的 URL |
| `format` | auto\|html\|json\|markdown? | 期望的返回格式，默认 auto |
| `timeout` | number? | 超时时间（ms） |
| `maxBytes` | number? | 最大响应体大小（bytes） |

> 使用 webfetch 而不是 bash(curl/wget)。

---

## 沙箱配置

bash 命令通过 OS 级沙箱（macOS sandbox-exec / Linux bubblewrap）限制文件系统和网络访问，并在执行前通过 Shell 命令权限策略校验。

### 配置文件

| 路径 | 作用域 |
|------|--------|
| `~/.pi/agent/sandbox.json` | 全局，所有项目生效 |
| `<cwd>/.pi/sandbox.json` | 当前项目，优先级高于全局 |

合并优先级：`DEFAULT_CONFIG → 全局 → 项目`。

### 配置项

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": [],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": [],
    "allowRead": [],
    "denyWrite": [],
    "allowWrite": ["."]
  },
  "shell": {
    "allowMultiple": false,
    "allowPipe": true,
    "permissons": {
      "*": "deny",
      "git *": "allow",
      "rg *": "allow"
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `enabled` | `false` 时禁用沙箱 |
| `network.allowedDomains` | 允许的域名，支持 `*` 和 `*.example.com` 通配；空数组拒绝所有网络 |
| `network.deniedDomains` | 显式拒绝的域名，优先级高于 `allowedDomains` |
| `filesystem.denyRead` | 拒绝读取的路径 |
| `filesystem.allowRead` | 允许读取的路径（OS 沙箱层） |
| `filesystem.denyWrite` | 拒绝写入的路径，优先级最高 |
| `filesystem.allowWrite` | 允许写入的路径，`"."` 展开为工作目录 |

### 禁用沙箱

```json
{ "enabled": false }
```

### Shell 命令权限

bash 命令在执行前通过权限策略校验，基于命令名和参数按具体性优先级匹配。**未匹配任何模式时默认拒绝**。

| 字段 | 说明 |
|------|------|
| `allowMultiple` | `false` 时禁止 `&&`、`;` 多命令串联 |
| `allowPipe` | `false` 时禁止 `|` 管道 |
| `permissons` | 命令权限映射，键为匹配模式，值为 `"allow"` / `"deny"` |

**模式语法**：

| 模式 | 匹配 |
|------|------|
| `"*"` | 所有命令 |
| `"git *"` | 命令名为 `git`，任意参数 |
| `"git push *"` | `git push`，任意参数 |
| `"git reset --hard"` | `git reset` 且参数包含 `--hard`（包含匹配） |

**优先级**：非 `*` 部分越多越具体；同具体性时原始字符串越长越优先。

---

## 其他

- 系统提示和工具描述均使用中文
- bash 自动 `SandboxManager.wrapWithSandbox()` 包装，受 `.pi/sandbox.json` 约束
