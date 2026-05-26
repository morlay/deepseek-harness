import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface ChatLogEntry {
  timestamp: string;
  request: {
    method: string;
    path: string;
    body: unknown;
  };
  response: {
    statusCode: number;
    body: unknown;
  };
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

export class LlmProxy {
  #server: ReturnType<typeof createServer>;
  #logs: ChatLogEntry[] = [];
  #port: number = 0;
  #logDir: string;
  #upstreamUrl: string;

  constructor(upstreamUrl: string, logDir: string) {
    this.#upstreamUrl = upstreamUrl;
    this.#logDir = logDir;
    this.#server = createServer((req, res) => this.#handle(req, res));
  }

  get port(): number {
    return this.#port;
  }

  get url(): string {
    return `http://127.0.0.1:${this.#port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#server.on("error", reject);
      this.#server.listen(0, "127.0.0.1", () => {
        const addr = this.#server.address();
        if (addr && typeof addr === "object") {
          this.#port = addr.port;
        }
        console.log(
          `[llm-proxy] listening on ${this.url} -> ${this.#upstreamUrl}`,
        );
        resolve();
      });
    });
  }

  /** 实时分析已捕获的日志 */
  getStats(sinceIndex = 0): ProxyStats {
    return parseStats(this.#logs.slice(sinceIndex));
  }

  get logCount(): number {
    return this.#logs.length;
  }

  #handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => this.#forward(req, res, Buffer.concat(chunks)));
    req.on("error", () => {
      if (!res.headersSent) {
        res.statusCode = 400;
        res.end();
      }
    });
  }

  #forward(req: IncomingMessage, res: ServerResponse, body: Buffer): void {
    const upstream = new URL(this.#upstreamUrl);
    const reqPath = req.url || "/";

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || HOP_BY_HOP.has(k.toLowerCase())) continue;
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    headers["host"] = upstream.host;
    if (body.length > 0) headers["content-length"] = String(body.length);

    const proxyReq = httpsRequest(
      {
        hostname: upstream.hostname,
        port: upstream.port || 443,
        path: reqPath,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const isChat =
          req.method === "POST" && reqPath.includes("/chat/completions");

        if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
          console.warn(
            `[llm-proxy] upstream ${proxyRes.statusCode} for ${req.method} ${reqPath}`,
          );
        }

        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);

        const resChunks: Buffer[] = [];
        proxyRes.on("data", (c: Buffer) => {
          resChunks.push(c);
          res.write(c);
        });
        proxyRes.on("end", () => {
          res.end();
          if (isChat) {
            console.log(`[llm-proxy] captured chat ${proxyRes.statusCode}`);
            this.#capture(
              reqPath,
              body,
              proxyRes.statusCode ?? 0,
              Buffer.concat(resChunks),
            );
          }
        });
        proxyRes.on("error", (e) => {
          console.error(`[llm-proxy] upstream response error: ${e.message}`);
          res.end();
        });
      },
    );

    proxyReq.on("error", (err) => {
      console.error(
        `[llm-proxy] upstream error for ${req.method} ${reqPath}: ${err.message}`,
      );
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.end();
      }
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  }

  #capture(
    path: string,
    reqBody: Buffer,
    statusCode: number,
    resBody: Buffer,
  ): void {
    try {
      const parsedReq = JSON.parse(reqBody.toString());
      const resText = resBody.toString();

      let parsedRes: unknown;
      if (parsedReq.stream === true) {
        parsedRes = this.#mergeSSE(resText);
      } else {
        try {
          parsedRes = JSON.parse(resText);
        } catch {
          parsedRes = { _raw: resText };
        }
      }

      this.#logs.push({
        timestamp: new Date().toISOString(),
        request: { method: "POST", path, body: parsedReq },
        response: { statusCode, body: parsedRes },
      });
    } catch (e) {
      console.error(`[llm-proxy] capture parse error:`, e);
    }
  }

  #mergeSSE(raw: string): unknown {
    const merged: Record<string, unknown> = {
      id: "",
      object: "chat.completion",
      created: 0,
      model: "",
      choices: [] as Record<string, unknown>[],
      usage: null,
    };

    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || !t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const p = JSON.parse(data) as Record<string, unknown>;
        merged.id ||= p.id;
        merged.created ||= p.created;
        merged.model ||= p.model;

        for (const ch of (p.choices as Record<string, unknown>[]) || []) {
          let ex = (merged.choices as Record<string, unknown>[]).find(
            (c) => c.index === ch.index,
          );
          if (!ex) {
            ex = {
              index: ch.index,
              message: { role: "assistant", content: "" },
              finish_reason: null,
            };
            (merged.choices as Record<string, unknown>[]).push(ex);
          }

          const d = ch.delta as Record<string, unknown> | undefined;
          if (d) {
            const m = ex.message as Record<string, unknown>;
            if (d.content)
              m.content = (m.content as string) + (d.content as string);
            if (d.reasoning_content)
              m.reasoning_content =
                ((m.reasoning_content as string) || "") +
                (d.reasoning_content as string);
            if (d.tool_calls) {
              const existingCalls =
                (m.tool_calls as Record<string, unknown>[]) || [];
              for (const tc of d.tool_calls as Record<string, unknown>[]) {
                let etc = existingCalls.find((c) => c.index === tc.index);
                if (!etc) {
                  etc = { ...tc };
                  existingCalls.push(etc);
                } else if (tc.function && etc.function) {
                  const fn = etc.function as Record<string, unknown>;
                  const nf = tc.function as Record<string, unknown>;
                  if (nf.name)
                    fn.name = ((fn.name as string) || "") + (nf.name as string);
                  if (nf.arguments)
                    fn.arguments =
                      ((fn.arguments as string) || "") +
                      (nf.arguments as string);
                }
              }
              m.tool_calls = existingCalls;
            }
          }
          if (ch.finish_reason) ex.finish_reason = ch.finish_reason;
        }

        if (p.usage) merged.usage = p.usage;
      } catch {
        // skip malformed sse lines
      }
    }

    return merged;
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.#server.close(async () => {
        console.log("[llm-proxy] server closed");
        await this.flush();
        resolve();
      });
    });
  }

  async flush(): Promise<string | null> {
    if (this.#logs.length === 0) {
      return null;
    }
    await mkdir(this.#logDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = join(this.#logDir, `log-${ts}.jsonl`);
    const content = this.#logs.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(filename, content);
    this.#logs = [];
    return filename;
  }
}

export interface ProxyStats {
  chats: number;
  tools: number;
  toolFreq: Record<string, number>;
  reasoningChats: number;
  avgReasoningLen: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  timeline: ProxyChatStat[];
}

export interface ProxyChatStat {
  index: number;
  tools: string[];
  reasoningPreview: string;
}

function parseStats(logs: ChatLogEntry[]): ProxyStats {
  const toolFreq: Record<string, number> = {};
  const timeline: ProxyChatStat[] = [];
  let totalReasoningLen = 0;
  let reasoningChats = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const [i, entry] of logs.entries()) {
    const chat: ProxyChatStat = { index: i, tools: [], reasoningPreview: "" };

    // 从 request body 的 messages 中提取 tool 结果消息中的工具名
    const reqBody = entry.request?.body as Record<string, unknown> | undefined;
    const reqMessages = reqBody?.messages as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(reqMessages)) {
      for (const m of reqMessages) {
        if (m.role === "tool" && typeof m.tool === "string") {
          chat.tools.push(m.tool);
          toolFreq[m.tool] = (toolFreq[m.tool] ?? 0) + 1;
        }
      }
    }

    // 从 response body 的 choices 中提取 tool_calls 和 reasoning
    const respBody = entry.response?.body as
      | Record<string, unknown>
      | undefined;
    const choices = respBody?.choices as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(choices)) {
      for (const ch of choices) {
        const msg = ch.message as Record<string, unknown> | undefined;
        if (msg) {
          if (typeof msg.reasoning_content === "string") {
            chat.reasoningPreview = (msg.reasoning_content as string).slice(
              0,
              120,
            );
            reasoningChats++;
            totalReasoningLen += (msg.reasoning_content as string).length;
          }
          const tcs = msg.tool_calls as
            | Array<Record<string, unknown>>
            | undefined;
          if (Array.isArray(tcs)) {
            for (const tc of tcs) {
              const name = (tc.function as Record<string, string> | undefined)
                ?.name;
              if (name) {
                chat.tools.push(name);
                toolFreq[name] = (toolFreq[name] ?? 0) + 1;
              }
            }
          }
        }
      }
    }

    const usage = respBody?.usage as Record<string, number> | undefined;
    if (usage) {
      totalPromptTokens += usage.prompt_tokens ?? 0;
      totalCompletionTokens += usage.completion_tokens ?? 0;
    }

    if (chat.tools.length > 0 || chat.reasoningPreview) {
      timeline.push(chat);
    }
  }

  return {
    chats: logs.length,
    tools: Object.values(toolFreq).reduce((a, b) => a + b, 0),
    toolFreq,
    reasoningChats,
    avgReasoningLen:
      reasoningChats > 0 ? Math.round(totalReasoningLen / reasoningChats) : 0,
    totalPromptTokens,
    totalCompletionTokens,
    timeline,
  };
}
