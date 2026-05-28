export type ShellPermission = "deny" | "allow";

export interface Shell {
  allowMultiple: boolean;

  allowPipe: boolean;

  permissons: Record<string, ShellPermission>;
}

export interface ParsedCommand {
  commandName: string;

  args: string[];
}

interface ParsedPermissionPattern {
  raw: string;
  commandName: string;
  argPatterns: string[];
  wildcardSuffix: boolean;
  specificity: number;
  permission: ShellPermission;
}

function splitCommands(input: string): {
  commands: string[];
  hasPipe: boolean;
  hasMultiple: boolean;
} {
  const commands: string[] = [];
  let hasPipe = false;
  let hasMultiple = false;
  let current = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += quote;
      i++;
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && quote === '"') {
          current += input[i++];
          if (i < input.length) current += input[i++];
        } else {
          current += input[i++];
        }
      }
      if (i < input.length) current += input[i++];
      continue;
    }

    if (ch === "&" && input[i + 1] === "&") {
      hasMultiple = true;
      if (current.trim()) commands.push(current.trim());
      current = "";
      i += 2;
      continue;
    }
    if (ch === "|" && input[i + 1] !== "|") {
      hasPipe = true;
      if (current.trim()) commands.push(current.trim());
      current = "";
      i++;
      continue;
    }
    if (ch === ";") {
      hasMultiple = true;
      if (current.trim()) commands.push(current.trim());
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) commands.push(current.trim());
  return { commands, hasPipe, hasMultiple };
}

function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (i < input.length) {
    const ch = input[i]!;

    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false;
      } else {
        current += ch;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === "\\" && i + 1 < input.length) {
        current += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      } else {
        current += ch;
      }
      i++;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      i++;
      continue;
    }

    if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current) tokens.push(current);
  return tokens;
}

function parseShellCommands(command: string): {
  commands: ParsedCommand[];
  hasPipe: boolean;
  hasMultiple: boolean;
} {
  const { commands: parts, hasPipe, hasMultiple } = splitCommands(command);
  const commands = parts.map((part) => {
    const tokens = tokenizeCommand(part);
    if (tokens.length === 0) {
      return { commandName: "", args: [] };
    }
    const commandName = tokens[0]!;
    const args = tokens.slice(1);
    return { commandName, args };
  });
  return { commands, hasPipe, hasMultiple };
}

function parsePattern(pattern: string): ParsedPermissionPattern {
  const parts = pattern.trim().split(/\s+/);

  if (parts.length === 1 && parts[0] === "*") {
    return {
      raw: pattern,
      commandName: "*",
      argPatterns: [],
      wildcardSuffix: true,
      specificity: 0,
      permission: "deny",
    };
  }

  const commandName = parts[0]!;
  let wildcardSuffix = false;
  const argPatterns: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    if (p === "*") {
      wildcardSuffix = true;
      break;
    }
    argPatterns.push(p);
  }

  const specificity = (commandName !== "*" ? 1 : 0) + argPatterns.length;

  return {
    raw: pattern,
    commandName,
    argPatterns,
    wildcardSuffix,
    specificity,
    permission: "deny",
  };
}

function commandMatchesPattern(
  cmd: ParsedCommand,
  pattern: ParsedPermissionPattern,
): boolean {
  if (pattern.commandName !== "*" && pattern.commandName !== cmd.commandName) {
    return false;
  }

  const cmdArgs = cmd.args;
  for (const pat of pattern.argPatterns) {
    if (!cmdArgs.some((a) => a === pat || a.includes(pat))) {
      return false;
    }
  }

  return true;
}

function sortPatternsBySpecificity(
  patterns: ParsedPermissionPattern[],
): ParsedPermissionPattern[] {
  return [...patterns].sort((a, b) => {
    if (a.specificity !== b.specificity) {
      return b.specificity - a.specificity;
    }
    return b.raw.length - a.raw.length;
  });
}

export interface ShellCheckResult {
  allowed: boolean;
  matchedPattern?: string;
  reason?: string;
}

export function checkShellCommand(
  command: string,
  shellConfig: Shell,
): ShellCheckResult {
  const { commands, hasPipe, hasMultiple } = parseShellCommands(command);

  if (!shellConfig.allowMultiple && hasMultiple) {
    return {
      allowed: false,
      reason: "不允许使用多命令串联（&&、;）",
    };
  }
  if (!shellConfig.allowPipe && hasPipe) {
    return {
      allowed: false,
      reason: "不允许使用管道（|）",
    };
  }

  const patterns: ParsedPermissionPattern[] = Object.entries(
    shellConfig.permissons,
  ).map(([patternStr, perm]) => {
    const parsed = parsePattern(patternStr);
    parsed.permission = perm;
    return parsed;
  });

  const sorted = sortPatternsBySpecificity(patterns);

  for (const cmd of commands) {
    if (!cmd.commandName) continue;

    let matched: ParsedPermissionPattern | null = null;
    for (const pattern of sorted) {
      if (commandMatchesPattern(cmd, pattern)) {
        matched = pattern;
        break;
      }
    }

    if (matched) {
      if (matched.permission === "deny") {
        return {
          allowed: false,
          matchedPattern: matched.raw,
          reason: `命令 "${cmd.commandName}" 匹配拒绝模式 "${matched.raw}"`,
        };
      }
      continue;
    }

    return {
      allowed: false,
      reason: `命令 "${cmd.commandName}" 未匹配任何权限模式（默认拒绝）`,
    };
  }

  return { allowed: true };
}
