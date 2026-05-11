# Agent

插件定义了 3 个主 agent 和 1 个子 agent，通过 `"config"` hook 注册到 opencode。

最终发给 LLM 的 system prompt 按以下结构拼接：

```
{{ agent.prompt }}

{{ include? "{OPENCODE_CONFIG_DIR}/AGENTS.md" }}
{{ include? "{PROJECT_DIR}/AGENTS.md" }}

<env>...</env>
<available_skills>...</available_skills>
```

- `agent.prompt` — 本插件注入，即下文各 agent 的专属提示词 + 共享提示词
- `include?` — opencode 按优先级包含全局与项目级 AGENTS.md，不存在则跳过
- `<env>` — 框架注入运行时环境（工作目录、平台、日期等）
- `<available_skills>` — 框架注入已安装 skill 列表

## 主 Agent

### code

默认的编码 agent。定位是复杂软件系统的设计者与守护者——主动思考架构、守卫质量、在必要时拒绝。

系统提示词分为五个层次：

- **内核**：边界先于可用、目录即架构、验证闭环、复杂度是债务
- **铁律**：有产出才叫完成、遇阻不降级、复杂任务必须分解
- **防线**：理解先于动手、外科精准、需求即精确约束、先确认再调用、不留半成品、推到底
- **决策原则**：默认行动、最小变更、模式一致、拒绝是守护
- **行动纪律**：闭环验证（实现→lint→build→test->fmt）

全工具可用。temperature 0.0。

Prompt 由 [`code.md`](src/agents/prompts/code.md) + 共享提示词拼接。

### chat

纯对话 agent，无系统提示词，无工具绑定。用于问答、解释、头脑风暴。temperature 0.7。

### doc

文档 agent。处理面向开发者/用户/决策者的各类文档。

核心约束：不为没读过的代码写文档、不为不存在的接口编造用法、用户文档不泄露实现细节、设计文档必须解释 trade-off。

权限：bash 禁止，webfetch 允许。

Prompt 由 [`doc.md`](src/agents/prompts/doc.md) + 共享提示词拼接。

## 子 Agent

### worker

被 `task` 工具调用的任务执行者。只做任务描述里明确要求的事，不超范围。完成后简洁汇报结果和异常。

使用轻量模型以确保响应速度。

Prompt 由 [`worker.md`](src/agents/prompts/worker.md) + 共享提示词拼接。

## 共享提示词

所有 agent 共享四个模块，拼接在各自提示词末尾：

- `language.md` — 语言规范：思考用中文，回答用中文
- `collaboration.md` — 协作节奏：自主推进至完成、中间简短更新、不问无谓确认
- `formatting.md` — 格式规范：无 emoji、代码用反引号、文件用 Markdown 链接
- `tool-use.md` — 工具使用：文件操作分层选择、工作目录优先、参数确认

引用路径：`src/agents/prompts/shared/`。
