import { type ToolInfo, type Skill } from "@earendil-works/pi-coding-agent";

const LANG = `
- **所有思考、分析、推理过程使用中文。专有名词除外**。thinking 块中严禁出现英文句子或英文短语，专有名词（如 API 名称、工具名、变量名）保留英文，但描述、解释、推理必须全部用中文。
- **回答用户时始终使用中文。**
`;

type ContetFile = {
  path: string;
  content: string;
};

export function buildSystemPrompt(ctx: {
  prompt: string;
  cwd: string;
  tools?: ToolInfo[];
  skills?: Skill[];
  contextFiles?: ContetFile[];
}) {
  let prompt = "";

  prompt = appendPart(prompt, { content: ctx.prompt });

  prompt = appendPart(prompt, { title: "语言", content: LANG });

  let promptGuidelines: string[] = [];

  for (const tool of ctx.tools ?? []) {
    if (tool.promptGuidelines) {
      promptGuidelines = [
        ...promptGuidelines,
        tool.promptGuidelines.join("；"),
      ];
    }
  }

  if (promptGuidelines.length > 0) {
    prompt = appendPart(prompt, {
      title: "工具使用",
      content: promptGuidelines.map((x) => `- ${x}`).join("\n"),
    });
  }

  if (ctx.contextFiles && ctx.contextFiles.length > 0) {
    prompt += `
<project_context>
`;
    for (const { path: filePath, content } of ctx.contextFiles) {
      prompt += `
<project_instructions path="${filePath}">
${content}
</project_instructions>
`.trimStart();
    }
    prompt += `
</project_context>
`;
  }

  if (ctx.skills && ctx.skills.length > 0) {
    prompt += formatSkillsForPrompt(ctx.skills);
    prompt += "\n\n";
  }

  prompt = appendPart(prompt, {
    content: `
---

当期日期： ${nowDate()}
当前工作目录： ${ctx.cwd}
`,
  });

  return prompt;
}

function appendPart(c: string, part: { title?: string; content: string }) {
  const p = part.title
    ? `
## ${part.title.trim()}

${part.content.trim()}
`
    : `
${part.content.trim()}
`;

  return c + p;
}

function nowDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSkillsForPrompt(skills: Skill[]): string {
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

  if (visibleSkills.length === 0) {
    return "";
  }

  const lines = [
    `
以下技能为特定任务提供专门的说明。
当任务与其描述匹配时，请使用 read() 加载技能文件。
当技能文件引用相对路径时，请将其解析为技能目录（SKILL.md 的父目录/路径的目录名），并在工具命令中使用该绝对路径。
`,
    "<available_skills>",
  ];

  for (const skill of visibleSkills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`,
    );
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
