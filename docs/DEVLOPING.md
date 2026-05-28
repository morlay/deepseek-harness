# 开发指南

## 常用命令

```
just dep        # 安装依赖
just vitest     # 运行全量测试
just oxlint     # 代码检查 （`--fix --fix-suggestions` 自动修复）
just fmt        # 格式化代码
```

`just vitest` 可传参局部跑：

```bash
just vitest src/hashline/__tests__/          # 引擎层测试
just vitest src/core/tools/__tests__/        # 工具层测试
just vitest e2e/                             # E2E 测试
```

## 工具链顺序

每次变更的固定步骤：

1. `just oxlint` — 检查（0 错误 0 警告才是完成）
2. `just vitest` — 测试
3. `just fmt` — 格式化

**导入**：

- 使用 `.ts` 扩展名（`moduleResolution: "bundler"`）
- 引擎层不引用工具层
- 废止的模块直接删除，不留注释掉的代码

**错误处理**：

- 引擎层使用语义化错误码：`[E_NO_MATCH]`、`[E_BAD_REF]`
- 工具层在 `execute` 中捕获并转为用户可读信息
- 不吞异常——遇到问题 throw，让框架处理

**类型**：

- 公开 API 导出 `type`（如 `EditOp`、`EditResult`）
- 内部辅助函数不导出
- 避免 `as any`——使用 `satisfies` 或显式类型断言

**字符串**

- `"` 包裹
- 多行使用 `\``，代码场景用, 如

```
const code = `
const x
`.trim()
```

## 工作流

新增一个功能的标准流程：

1. **引擎层先行** — 在 `src/internal/` 实现纯逻辑
2. **补全测试** — 在 `__tests__/` 写单元测试，覆盖正常路径和边界
3. **验证闭环** — `just vitest src/hashline/` 通过后再继续
4. **行为测试** — 测完整用户场景（如 "read 获取锚点 → edit 替换"），不测单个 API 调用
5. **oxlint → vitest** — 全部通过才算完成

每一步都停下来确认——不做假设，只信测试结果。

## 测试策略

**三层测试金字塔**：

| 层级         | 位置                               | 特点                                           | 速度    |
| ------------ | ---------------------------------- | ---------------------------------------------- | ------- |
| 引擎单元测试 | `src/internal/hashline/__tests__/` | 纯函数 + hash 一致性 + grepAsHashline 直接验证 | < 10ms  |
| 工具行为测试 | `src/tools/__tests__/`             | `execute()` 调用，验闭环                       | < 100ms |
| E2E 测试     | `e2e/`                             | 启动 opencode server，LLM 交互                 | 10-120s |

**测试原则**：

- 引擎测试覆盖正常路径 + 边界（空输入、越界、哈希不匹配）
- 工具测试是行为驱动的——验证用户场景闭环，不验证单个 API
- 自定义工具直接调 `execute()` 做单元测试，不启动完整 server
- E2E 测试依赖真实 LLM，串行执行，超时宽松

**命名约定**：

- 测试文件：单元测试 `{domain}.spec.ts`，e2e 测试 `{topic}.test.ts`
- describe 块：功能名或场景分组
- it 块：用中文描述行为，形如 "grep 搜索 → 锚点提取 → 替换"
