# patch

批量精确修改文件，用结构化 JSON 替代 diff 格式。一次调用可处理多个文件。

## 操作

| 操作                 | 含义                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `{ replace, old }`   | 找到 `old`（精确匹配），替换为 `replace`。`replace` ≠ `old`。每对只替换首次出现，多处相同需列多个 |
| `{ insert, after? }` | 在 `after` 行之后插入 `insert`；`after` 为空时追加到末尾（文件不存在则创建）                      |
| `{ rename }`         | 重命名/移动文件。`filePath` 为原路径，`rename` 为目标路径。不能与 actions/delete 混用             |
| `{ delete: true }`   | 删除文件                                                                                          |

actions 按数组顺序依次执行——前一个操作的结果影响后续操作的匹配位置。

## 调用格式

```
calls: [
  { filePath, actions: [{ replace, old } | { insert, after? }] },
  { filePath, rename },
  { filePath, delete: true }
]
```

## 示例

**替换**：

```json
{
  "calls": [
    {
      "filePath": "src/a.ts",
      "actions": [{ "replace": "const x = 1", "old": "const x = 0" }]
    }
  ]
}
```

**插入**（after 为空时追加到末尾，创建新文件）：

```json
{
  "calls": [
    {
      "filePath": "src/app.ts",
      "actions": [
        {
          "insert": "import { foo } from './foo'",
          "after": "import { bar } from './bar'"
        }
      ]
    }
  ]
}
```

**创建文件**：

```json
{
  "calls": [
    { "filePath": "new.ts", "actions": [{ "insert": "export const x = 1" }] }
  ]
}
```

**重命名/移动**：

```json
{
  "calls": [{ "filePath": "old-name.ts", "rename": "new-name.ts" }]
}
```

**批量修改多文件**：

```json
{
  "calls": [
    {
      "filePath": "lib/fib.py",
      "actions": [
        { "old": "def fib(n):", "replace": "def fibonacci(n):" },
        {
          "old": "return fib(n-1) + fib(n-2)",
          "replace": "return fibonacci(n-1) + fibonacci(n-2)"
        }
      ]
    },
    {
      "filePath": "run.py",
      "actions": [
        {
          "old": "from lib.fib import fib",
          "replace": "from lib.fib import fibonacci"
        },
        { "old": "print(fib(42))", "replace": "print(fibonacci(42))" }
      ]
    }
  ]
}
```

**删除**：

```json
{
  "calls": [{ "filePath": "legacy.ts", "delete": true }]
}
```
