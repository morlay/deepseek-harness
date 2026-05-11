import { readFile } from "node:fs/promises";

export interface ChatStat {
  index: number;
  timestamp: string;
  tools: string[];
  toolCount: number;
  hasReasoning: boolean;
  reasoningLen: number;
  reasoningPreview: string;
}

export interface LogStats {
  file: string;
  totalChats: number;
  totalTools: number;
  toolFreq: Record<string, number>;
  reasoningChats: number;
  avgReasoningLen: number;
  chats: ChatStat[];
}

/** 解析单个 JSONL 日志文件，返回工具调用和 thinking 统计 */
export async function analyzeLog(filePath: string): Promise<LogStats> {
  const raw = await readFile(filePath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);

  const stats: LogStats = {
    file: filePath,
    totalChats: 0,
    totalTools: 0,
    toolFreq: {},
    reasoningChats: 0,
    avgReasoningLen: 0,
    chats: [],
  };

  let totalReasoningLen = 0;

  for (const [i, line] of lines.entries()) {
    try {
      const entry = JSON.parse(line);
      const chat: ChatStat = {
        index: i,
        timestamp: entry.timestamp ?? "",
        tools: [],
        toolCount: 0,
        hasReasoning: false,
        reasoningLen: 0,
        reasoningPreview: "",
      };

      // 从 response 提取 tool_calls 和 reasoning
      const choices = entry.response?.body?.choices;
      if (Array.isArray(choices)) {
        for (const ch of choices) {
          const msg = ch.message;
          if (!msg) continue;

          // reasoning
          if (typeof msg.reasoning_content === "string") {
            chat.hasReasoning = true;
            chat.reasoningLen = msg.reasoning_content.length;
            chat.reasoningPreview = msg.reasoning_content.slice(0, 120);
            totalReasoningLen += chat.reasoningLen;
          }

          // tool calls
          const tcs = msg.tool_calls;
          if (Array.isArray(tcs)) {
            for (const tc of tcs) {
              const name = tc.function?.name;
              if (name) {
                chat.tools.push(name);
                stats.toolFreq[name] = (stats.toolFreq[name] ?? 0) + 1;
              }
            }
          }
        }
      }

      // 也检查 request 中的 tool 消息（上一轮的 tool 结果）
      const reqMessages = entry.request?.body?.messages;
      if (Array.isArray(reqMessages)) {
        for (const m of reqMessages) {
          if (m.role === "tool" && m.tool) {
            chat.tools.push(m.tool);
            stats.toolFreq[m.tool] = (stats.toolFreq[m.tool] ?? 0) + 1;
          }
        }
      }

      chat.toolCount = chat.tools.length;
      stats.totalTools += chat.toolCount;
      if (chat.hasReasoning) stats.reasoningChats++;
      stats.chats.push(chat);
    } catch {
      // 跳过解析失败的行
    }
  }

  stats.totalChats = stats.chats.length;
  stats.avgReasoningLen =
    stats.reasoningChats > 0
      ? Math.round(totalReasoningLen / stats.reasoningChats)
      : 0;

  return stats;
}

/** 格式化统计为可读字符串 */
export function formatStats(s: LogStats): string {
  const lines: string[] = [
    `File: ${s.file.split("/").pop() ?? s.file}`,
    `Chats: ${s.totalChats} | Tools: ${s.totalTools} | Reasoning: ${s.reasoningChats}/${s.totalChats} (avg ${s.avgReasoningLen} chars)`,
    `Tool usage:`,
  ];

  const sorted = Object.entries(s.toolFreq).sort((a, b) => b[1] - a[1]);
  for (const [tool, count] of sorted) {
    lines.push(`  ${tool}: ${count}`);
  }

  lines.push(`Chat timeline:`);
  for (const c of s.chats) {
    const tools = c.tools.length > 0 ? ` [${c.tools.join(", ")}]` : "";
    const preview = c.reasoningPreview ? ` "${c.reasoningPreview}"` : "";
    lines.push(`  #${c.index}${preview}${tools}`);
  }

  return lines.join("\n");
}
