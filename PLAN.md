# 迭代计划

围绕 [GOAL.md](GOAL.md) 的三个目标，通过 e2e 实测 -> 日志分析 -> 定向修改的闭环持续优化。

## 迭代闭环

```
跑现有场景 -> 分析日志 -> 定位偏差 -> 修改 -> 验证 -> 补充场景
    ^                                                  |
    |______________________ repeat ____________________|
```

场景不追求一次覆盖全。边迭代边补——每发现一类新的偏差就追加对应 e2e。先从已有场景跑出数据，再根据日志暴露的问题决定下一步补什么。

每次迭代产出具体改动，附带前后对比（轮次、token 消耗、工具选择是否合理）。

## 目标一：工具效率

**衡量标准**：每个 e2e 场景达到最少工具调用轮次完成正确结果。工具选择正确、参数传对，避免 bash 兜底和反复试错。

### 工具选择

- [x] 首次工具选择是否正确（grep 而非 read 查内容，sg 而非 grep 做代码改写）— 基本正确，pattern-params 中的 grep 使用了 lookahead 后 fallback 到 bash
- [x] 是否有不必要的重复调用（同一文件读多次、同一搜索跑两遍）— 基本无，仅 pattern-params 中 sg 后反复用 bash 查帮助

### 参数正确性

路径是最容易出错的参数。需要专门的 e2e 场景覆盖：

- [x] **路径参数**：`filePath`/`path` 是否传了基于工作目录的路径而非项目根 → `e2e/tool/path-params.test.ts`
- [x] **pattern 格式**：`grep` 的正则、`sg` 的 AST pattern、`glob` 的通配符格式是否正确 → `e2e/tool/pattern-params.test.ts`
- [x] **必填参数**：是否遗漏了必填参数（如 `sg` 的 pattern、`patch` 的 calls 数组）→ `e2e/tool/arg-validation.test.ts`
- [x] **参数约束**：参数值是否符合 schema（如 `read` 的 offset/limit 为正整数）→ `read.ts` offset 约束已修复 (>=0→>=1) + `e2e/tool/arg-validation.test.ts`

验证方式：解析 `logs/` 中每条 tool call 的 args，与期望值或格式匹配。

### 描述准确性

- [x] 工具 description 是否反映实测行为（如 `write` 自动创建父目录、`patch` 删除文件行为）
- [x] 冷门工具（`sg`、`patch` 删除文件）的描述中是否给出了可直接复用的示例
- [x] 参数描述是否与 function call 格式对齐（`fn(pattern:"...")` 而非 CLI `-p '...'`）

- [x] `read` offset 约束与描述一致（>=0 → >=1，与"从 1 开始"对齐）
- [x] `bash` description 反映单条命令约束
- [x] `grep` description 补充调用示例

**操作**：修改 `src/tools/*.ts` 中的 description 或 args.describe。

## 目标二：语言一致

**衡量标准**：所有 thinking、回答、工具调用中的自然语言输出全程中文。无中英混杂句和英文短语。

**迭代方向**：

- [x] 检查 agent prompt（`src/agents/prompts/`）是否明确约束了语言使用 — `language.md` 明确约束 thinking 块和回答必须中文，专有名词豁免
- [ ] 日志中是否出现英文思考步骤或中英混杂表达 — 日志仅含 request 缺 response，无法直接验证。需改进日志记录或增加 e2e 检查项
- [x] 工具 description 和参数描述是否全部中文 — 14 个工具 description + 参数 describe 全中文，专有名词（POSIX ERE、PCRE、LSP 等）在豁免范围内

**操作**：修改 prompt 或工具描述中的语言约束。已知缺口：系统内建 task 工具的 agent types 描述为英文，不在插件控制范围。

## 目标三：工作习惯

**衡量标准**：LLM 行为是否体现了 GOAL.md 的设计/编码/文档三原则。

**迭代方向**：

- [x] 复杂任务是否正确使用 `todowrite` 分解步骤 — `collaboration.md` 和 `code.md` 铁律中已约束，本轮交互中正确使用
- [x] 变更后是否主动执行 lint/fmt/test 验证 — `code.md` 行动纪律已约束，本轮每次变更后均执行验证
- [x] 是否出现凭记忆回答文件内容而未先读取的情况 — `tool-use.md` 和 `code.md` 防线中已约束，本轮修改前均先 read
- [x] 是否出现输出 `// TODO` 或 `// ...` 半成品 — `code.md` 防线明确禁止，未发现此类情况

**操作**：强化 `src/agents/prompts/code.md` 或 shared prompt 中的行为约束。当前约束已足够，关键在日志验证闭环。

## e2e 验收分级

| 场景类型 | 验收方式                | 示例                            |
| -------- | ----------------------- | ------------------------------- |
| 只读工具 | 验证工具被调用次数 > 0  | glob, grep, sg, bash, webfetch  |
| 写工具   | 验证文件最终状态        | write, edit, patch              |
| 复杂任务 | 验证最终目标达成        | project-build (vitest run 通过) |
| 语言质量 | 验证 thinking/回复中文  | e2e/quality/language.test.ts    |
| 工作习惯 | 验证 todowrite/验证闭环 | e2e/quality/work-habits.test.ts |

不稳定场景（如 sg rewrite）降级为只验证工具调用，不验证文件结果。

## 待补场景

基于目标一的参数验证需求，优先级从高到低：

1. ✅ **read 路径验证**：指定嵌套目录下的文件，验证 LLM 是否基于工作目录传路径 → `e2e/tool/path-params.test.ts`
2. ✅ **写工具路径验证**：write 到子目录，验证自动创建父目录且路径正确 → 同上
3. ✅ **grep/glob 路径验证**：在子目录中搜索，验证 path 参数指向正确位置 → 同上
4. ✅ **patch 路径验证**：修改子目录文件，验证相对路径解析正确 → 同上
5. ✅ **pattern 格式验证**：grep 正则、sg AST pattern、glob 通配符格式 → `e2e/tool/pattern-params.test.ts`
6. ✅ **必填参数与约束验证**：sg pattern、patch calls 必填；read offset/limit 正整数；write filePath/content 齐全 → `e2e/tool/arg-validation.test.ts`

## 本轮迭代（2026-05-22 #3）

### patch 参数优化 `from` → `old`

LLM 频繁将 `replace` 和 `from` 混淆（写成相同值导致不生效），退化到逐处 edit。根因是参数名歧义——`replace` 听起来像动作而非目标值。

**改动**：

- `_internal/patch.ts` — ReplaceAction 类型 `from` → `old`
- `patch.ts` — description 加 ⚠️ `replace` ≠ `old`，补注"每对只替换首次出现，多处相同需列多个"
- `tool-use.md`、`docs/patch.md`、`docs/tools.md`、`AGENTS.md` — 同步更新

### 新增 `rename` 操作

patch 缺少文件重命名能力，在"目录即架构"的场景中需要 mv 语义。`rename` 作为与 `actions`/`delete` 同级的新操作，不能与它们混用。

**改动**：

- `patch.ts` — schema 加 `rename` 字段，execute 中 `fsRename` 实现，自动创建目标父目录
- `patch-rename.test.ts` — 2 个 e2e 场景（重命名、移动到子目录）

### 效果验证

patch-batch 三轮稳定性测试：

| 指标       | 优化前               | 优化后（三轮平均） |
| ---------- | -------------------- | ------------------ |
| 总耗时     | 65s                  | **27s**            |
| chats      | 22                   | **13**             |
| patch 调用 | 1                    | **3**              |
| edit 调用  | 7                    | **0**              |
| 工具种类   | patch/edit/bash/read | **patch/read**     |

退化根因 `replace`/`from` 歧义被 `replace`/`old` + "多处相同需列多个"规则彻底消除。

## 本轮日志分析发现（2026-05-22 #2）

e2e/tool 全量通过（25/25，含 write 工具选择修复后复测）。新增 `e2e/quality/` 场景覆盖目标二、三（4/4 通过）。

### 修复项

1. **grep 正则引擎** (`grep.ts`)：补注"正则引擎为 POSIX ERE，不支持 PCRE 特性（如 lookahead、lookbehind、反向引用）"。

2. **sg 输出格式** (`sg.ts`)：补注"搜索返回 `文件路径:行号:起始列:结束列: 匹配内容`，无匹配返回 (no matches)"。

3. **grep/glob `.gitignore` 影响** (`grep.ts`, `glob.ts`)：补注受 `.gitignore` 影响，被忽略的目录可能搜索不到。`logs/` 目录在 `.gitignore` 中，grep 无法搜索日志文件，需用 `bash(command: "rg ...")` 代替。

4. **write 创建文件工具选择** (`tool-use.md`)：增加"覆写/创建"分类，明确**单文件操作优先 write/edit，多文件操作用 patch**。修复后 path-params write 场景从 fail→pass。

### 新增 e2e 场景

5. **中文 thinking 断言** (`e2e/quality/language.test.ts`)：验证 reasoning_content 不含英文自然语言句段，assistant 文本回复包含中文。添加 `reasoningText`、`hasEnglishSentence`、`assistantText` 三个测试辅助函数。

6. **todowrite 使用断言** (`e2e/quality/work-habits.test.ts`)：4 步复杂任务验证 LLM 使用 `todowrite` 分解步骤，并验证任务最终状态正确。

### 目标二/三状态更新

- 目标二（语言一致）：静态检查全通过，动态验证通过（2 e2e 场景）。已知风险：系统内建 task 工具的 agent types 描述为英文，不在控制范围。
- 目标三（工作习惯）：todowrite 使用、验证闭环、先读后写、不留半成品 — 均通过 prompt 约束和 e2e 验证。

## 上一轮日志分析（2026-05-22 #1）

e2e/tool 全量通过（25/25）。patch 已从 V4A diff 改为结构化 JSON actions，工具效率显著提升。

1. **patch 重构**：V4A diff 格式因缩进/锚点/跳行等约束，LLM 无法稳定构造正确 diff→`Invalid Context` 频发。替换为 `{ replace/from, insert/after, delete }` 结构化 JSON 后，fib→fibonacci 场景从 7-9 轮降到 4 轮，无任何错误。

2. **grep 正则引擎**：`pattern-params` 测试中 LLM 使用了 PCRE lookahead `(?=.*export)(?=.*const)`，grep 不支持后 fallback 到 `bash rg`。需在 grep description 中注明正则引擎（POSIX ERE）。→ 已修复

3. **sg 输出格式**：`pattern-params` 测试中 LLM 搜索成功后因不确定输出格式，反复用 bash 查 sg --help（+5 次无效调用）。需在 sg description 中补充输出格式说明。→ 已修复

## 日常命令

```bash
# 回归目标一（工具效率）
DEEPSEEK_API_KEY=sk-xxx just vitest e2e/tool/

# 回归目标二/三（语言一致 + 工作习惯）
DEEPSEEK_API_KEY=sk-xxx just vitest e2e/quality/

# 跑单个场景
DEEPSEEK_API_KEY=sk-xxx just vitest e2e/tool/path-params.test.ts

# 全量所有目标
DEEPSEEK_API_KEY=sk-xxx just vitest e2e/
```

日志文件位于 `logs/` 目录，按时间戳命名（`log-{datetime}.jsonl`）。每次 e2e 运行后最新的即为本次记录。
