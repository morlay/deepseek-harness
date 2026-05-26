# Hashline：LLM 与文件的锚点同步

## 问题

LLM 通过工具操作文件时，面临一个核心难题：**如何精确引用文件中的某一行？**

传统方案是用行号，但行号脆弱——插入或删除一行，后续所有行的行号全部偏移。LLM 在上下文中记住的"第 12 行"，在上一轮编辑后可能已经是完全不同的内容。

hashline 的方案：给每一行附加一个由内容导出的**哈希指纹**，构成 `LINE#HASH` 锚点。行号提供位置，哈希验证身份。

## LLM 看到什么

### 搜索返回

```
hashgrep(pattern: "subtract", path: "src/")
```

返回带锚点的匹配行：

```
src/utils.ts
2#SR:export const subtract = (a, b) => a - b
```

LLM 取 `2#SR` 作为锚点，无需额外解析。

### 读取返回

```
hashread(filePath: "src/app.ts", offset: 5, limit: 3)
```

返回指定范围的每一行，同样带锚点：

```
5#MQ:const host = 'localhost'
6#TS:const port = 3000
7#KV:const debug = true
```

## LLM 编辑后收到什么反馈

hashedit 执行后返回 diff 风格的变更清单：

```
E src/utils.ts
-2#SR
+2#NV
```

- `-LINE#HASH` — 被删除或替换的旧行，**锚点已失效，不可再用**
- `+LINE#HASH` — 新插入或替换后的行，**即文件当前最新锚点，可直接用于下一轮编辑**

若编辑改变了行号（删除、插入等），末尾追加 `@line` 偏移表达式：

```
E lines.ts
-2#YK
@line(>2, line => line - 1)
```

`@line(>2, line => line - 1)` 表示：行号 > 2 的旧锚点，新行号 = 旧行号 - 1。多次操作导致多段不同偏移时，会输出多行 `@line`。

### 删除与移动

删除文件：

```
D src/deprecated.ts
```

重命名/移动文件：

```
M src/old.ts → src/new.ts
```

## LLM 如何保持上下文同步

### 规则 1：变更清单里的 `+` 锚点可直接用

```
第一轮：host = 'localhost' → host = '0.0.0.0'
  返回: -1#JS  +1#XX

第二轮：LLM 看到 +1#XX，直接用它再改 host → 无需 hashgrep 重新搜索
```

### 规则 2：未出现在变更清单中的行，锚点仍然有效

修改了第 1 行，第 3 行的锚点不受影响——行号没变，内容没变，哈希没变。LLM 可以继续使用之前 hashread 或 hashgrep 返回的第 3 行锚点。

### 规则 3：用 `@line` 偏移推算受影响行的新锚点，无需重读

删除了第 2 行后，hashedit 返回：

```
-2#YK
@line(>2, line => line - 1)
```

LLM 看到 `@line(>2, line => line - 1)`，直接推算：旧锚点 `3#KV` 的行号 3 > 2，新行号 = 3 - 1 = 2。直接用 `2#KV` 编辑，无需重新搜索。偏移归零的区域不输出 `@line`。

### 规则 4：哈希是内容导出的，LLM 编不出合法锚点

LLM 产生幻觉凭空编了一个 `5#ZZ`。hashline 计算文件第 5 行的实际哈希发现不匹配，返回 `[E_NO_MATCH]`。LLM 兜底重新 hashgrep/hashread 获取真实锚点后重试。

关键保障：**LLM 可以犯错，文件不会坏**。最坏情况是一次失败的 hashedit 调用 + 一次重试，文件内容始终一致。

## 工作流

```
发现              编辑                      验证
───→              ───→                      ───→
hashgrep         hashedit                  hashedit 返回 diff
返回锚点         传入锚点执行                - 旧锚点（失效）
LINE#HASH:txt    replace/delete             + 新锚点（可复用）
                 append/prepend             @line(>N, ...) 偏移推算
                                              │
                 ┌────────────────────────────┘
                 │ 如果 [E_NO_MATCH]
                 ▼
               hashread/hashgrep 重获锚点 → 重试
```

一次调用可同时包含编辑、删除、重命名：

```
E src/app.ts
-3#KV
+3#RN
D src/deprecated.ts
M src/old.ts → src/new.ts
```

## 创建新文件

hashedit 的 append 操作不带 `pos` 时，如果文件不存在则自动创建（含父目录）。LLM 不需要区分"编辑已有文件"和"创建新文件"——同一个工具、同一种调用模式。
