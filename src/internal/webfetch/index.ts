import TurndownService from "turndown";

export type WebFetchFormat = "auto" | "html" | "json" | "markdown";

export interface WebFetchOptions {
  format?: WebFetchFormat;

  headers?: Record<string, string>;

  timeout?: number;

  maxBytes?: number;
}

export interface WebFetchResult {
  content: string;

  format: "html" | "json" | "markdown";

  contentType: string | null;

  status: number;

  url: string;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
});

function parseContentType(contentType: string | null): string {
  if (!contentType) return "";

  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isHtmlContent(contentType: string): boolean {
  return contentType === "text/html" || contentType === "application/xhtml+xml";
}

function isJsonContent(contentType: string): boolean {
  return (
    contentType === "application/json" ||
    contentType === "application/ld+json" ||
    (contentType.startsWith("application/") && contentType.endsWith("+json"))
  );
}

function isMarkdownContent(contentType: string): boolean {
  return contentType === "text/markdown" || contentType === "text/x-markdown";
}

export async function webFetch(
  url: string,
  options: WebFetchOptions = {},
): Promise<WebFetchResult> {
  const {
    format = "auto",
    headers = {},
    timeout = DEFAULT_TIMEOUT,
    maxBytes = DEFAULT_MAX_BYTES,
  } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "text/html, application/json, text/markdown, text/plain, */*",
    ...headers,
  };

  if (format === "markdown") {
    requestHeaders["Accept"] = "text/markdown, text/html, */*";
  } else if (format === "json") {
    requestHeaders["Accept"] = "application/json, */*";
  } else if (format === "html") {
    requestHeaders["Accept"] = "text/html, */*";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`请求超时: ${url} (${timeout}ms)`);
    }
    throw new Error(
      `请求失败: ${url} - ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${url} - ${body.slice(0, 500)}`);
  }

  const rawContentType = response.headers.get("content-type");
  const mimeType = parseContentType(rawContentType);

  let body: string;
  try {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error(
        `响应体过大: ${(text.length / 1024 / 1024).toFixed(1)}MB (限制 ${maxBytes / 1024 / 1024}MB)`,
      );
    }
    body = text;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("响应体过大")) {
      throw err;
    }
    throw new Error(
      `读取响应失败: ${url} - ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let outputFormat: "html" | "json" | "markdown";
  let content: string;

  if (format === "json") {
    outputFormat = "json";

    try {
      JSON.parse(body);
    } catch {
      throw new Error(`响应不是合法 JSON: ${url}`);
    }
    content = body;
  } else if (format === "html") {
    outputFormat = "html";
    content = body;
  } else if (format === "markdown") {
    outputFormat = "markdown";
    if (isMarkdownContent(mimeType)) {
      content = body;
    } else if (isHtmlContent(mimeType) || mimeType === "text/plain") {
      content = turndown.turndown(body);
    } else if (isJsonContent(mimeType)) {
      content = "```json\n" + body + "\n```";
    } else {
      content = body;
    }
  } else {
    if (isJsonContent(mimeType)) {
      outputFormat = "json";
      content = body;
    } else if (isMarkdownContent(mimeType)) {
      outputFormat = "markdown";
      content = body;
    } else if (isHtmlContent(mimeType)) {
      outputFormat = "markdown";
      content = turndown.turndown(body);
    } else {
      outputFormat = "markdown";
      content = body;
    }
  }

  return {
    content,
    format: outputFormat,
    contentType: rawContentType,
    status: response.status,
    url: response.url,
  };
}
