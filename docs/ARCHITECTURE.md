# OpenCode 最终提示词组装规则

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
