export function toolsCalled(messages: any[], name: string): number {
  let count = 0;
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === "tool" && p.tool === name) count++;
    }
  }
  return count;
}

export function toolInput(messages: any[], name: string): any[] {
  const args: any[] = [];
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === "tool" && p.tool === name && p.state?.input) {
        args.push(p.state.input);
      }
    }
  }
  return args;
}

/** 检查 filePath 是否为非法绝对路径（工作目录前缀的绝对路径视为合法） */
export function isAbsPath(fp: string, cwd: string): boolean {
  if (fp.startsWith(cwd + "/") || fp === cwd) return false;
  return /^\/|\.\.|^[A-Za-z]:[\\/]/.test(fp);
}

/** 提取 session messages 中所有 reasoning (thinking) 文本，拼接为单个字符串 */
export function reasoningText(messages: any[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === "reasoning" && p.text) {
        parts.push(p.text);
      }
    }
  }
  return parts.join("\n");
}

/** 检查文本是否包含英文句子（非代码 token 的自然语言英文段落） */
export function hasEnglishSentence(text: string): boolean {
  // 逐行检查，跳过看起来像代码的行（含运算符或特殊字符）
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 跳过以中文字符开头的行
    if (/^[\u4e00-\u9fff]/.test(trimmed)) continue;
    // 跳过代码行（含运算符、括号、赋值等）
    if (/[=<>{}()[\]\];:]/.test(trimmed)) continue;
    // 检查是否有 5+ 个连续英文单词（自然语言英文句子的特征）
    if (
      /\b[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\b/.test(
        trimmed,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** 提取 session messages 中所有 assistant 文本回复 */
export function assistantText(messages: any[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    // 跳过 system 和 user message
    const role = m.role || m.info?.role;
    if (role === "system" || role === "user") continue;

    for (const p of m.parts ?? []) {
      // reasoning parts 不算文本回复
      if (p.type === "reasoning") continue;
      if (p.text && typeof p.text === "string") {
        parts.push(p.text);
      }
    }
  }
  return parts.join("\n");
}
