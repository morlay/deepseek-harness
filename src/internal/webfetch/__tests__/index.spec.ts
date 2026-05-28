import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { webFetch } from "../index.ts";

function createTestServer(): { app: Hono; server: Server; url: string } {
  const app = new Hono();

  app.get("/html", (c) => {
    return c.html(`<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Hello World</h1>
  <p>This is a <strong>test</strong> page.</p>
  <ul>
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
  <pre><code>const x = 1;</code></pre>
</body>
</html>`);
  });

  app.get("/json", (c) => {
    return c.json({ message: "Hello", count: 42, items: ["a", "b"] });
  });

  app.get("/text", (c) => {
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body("Hello, this is plain text.\nLine two.");
  });

  app.get("/markdown", (c) => {
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(
      "# Hello Markdown\n\nThis is **bold** and *italic*.\n\n- item 1\n- item 2",
    );
  });

  app.get("/redirect", (c) => {
    return c.redirect("/html");
  });

  app.get("/not-found", (c) => {
    return c.notFound();
  });

  app.get("/error", (c) => {
    c.status(500);
    return c.body("Internal Server Error");
  });

  app.get("/large-json", (c) => {
    return c.json({ data: "x".repeat(1000) });
  });

  app.get("/ld-json", (c) => {
    c.header("Content-Type", "application/ld+json");
    return c.body(
      JSON.stringify({ "@context": "https://schema.org", name: "Test" }),
    );
  });

  app.get("/slow", async (c) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return c.text("slow response");
  });

  const server = serve({ fetch: app.fetch, port: 0 }) as Server;
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to get server address");
  }
  const url = `http://127.0.0.1:${addr.port}`;

  return { app, server, url };
}

describe("webFetch", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const test = createTestServer();
    server = test.server;
    baseUrl = test.url;
  });

  afterAll(() => {
    server.close();
  });

  describe("format: auto", () => {
    it("HTML 页面自动转换为 Markdown", async () => {
      const result = await webFetch(`${baseUrl}/html`);
      expect(result.format).toBe("markdown");
      expect(result.status).toBe(200);
      expect(result.content).toContain("# Hello World");
      expect(result.content).toContain("**test**");

      expect(result.content).toContain("Item 1");
      expect(result.content).toContain("Item 2");
      expect(result.content).toContain("```");
      expect(result.content).toContain("const x = 1;");
    });

    it("JSON API 返回 JSON 文本", async () => {
      const result = await webFetch(`${baseUrl}/json`);
      expect(result.format).toBe("json");
      expect(result.status).toBe(200);
      const parsed = JSON.parse(result.content);
      expect(parsed).toEqual({
        message: "Hello",
        count: 42,
        items: ["a", "b"],
      });
    });

    it("Markdown 内容原样返回", async () => {
      const result = await webFetch(`${baseUrl}/markdown`);
      expect(result.format).toBe("markdown");
      expect(result.status).toBe(200);
      expect(result.content).toContain("# Hello Markdown");
      expect(result.content).toContain("**bold**");
      expect(result.content).toContain("- item 1");
    });

    it("纯文本返回原样", async () => {
      const result = await webFetch(`${baseUrl}/text`);

      expect(result.format).toBe("markdown");
      expect(result.content).toBe("Hello, this is plain text.\nLine two.");
    });

    it("application/ld+json 识别为 JSON", async () => {
      const result = await webFetch(`${baseUrl}/ld-json`);
      expect(result.format).toBe("json");
      const parsed = JSON.parse(result.content);
      expect(parsed.name).toBe("Test");
    });
  });

  describe("format: html", () => {
    it("强制返回 HTML 原文", async () => {
      const result = await webFetch(`${baseUrl}/html`, { format: "html" });
      expect(result.format).toBe("html");
      expect(result.content).toContain("<!DOCTYPE html>");
      expect(result.content).toContain("<h1>Hello World</h1>");
    });
  });

  describe("format: json", () => {
    it("强制返回 JSON 原文", async () => {
      const result = await webFetch(`${baseUrl}/json`, { format: "json" });
      expect(result.format).toBe("json");
      const parsed = JSON.parse(result.content);
      expect(parsed.message).toBe("Hello");
    });

    it("非 JSON 内容报错", async () => {
      await expect(
        webFetch(`${baseUrl}/html`, { format: "json" }),
      ).rejects.toThrow("不是合法 JSON");
    });
  });

  describe("format: markdown", () => {
    it("HTML 自动转换为 Markdown", async () => {
      const result = await webFetch(`${baseUrl}/html`, { format: "markdown" });
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("# Hello World");
      expect(result.content).not.toContain("<h1>");
    });

    it("Markdown 内容原样返回", async () => {
      const result = await webFetch(`${baseUrl}/markdown`, {
        format: "markdown",
      });
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("# Hello Markdown");
    });

    it("JSON 包装为 Markdown 代码块", async () => {
      const result = await webFetch(`${baseUrl}/json`, { format: "markdown" });
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("```json");
    });
  });

  describe("错误处理", () => {
    it("404 抛出错误", async () => {
      await expect(webFetch(`${baseUrl}/not-found`)).rejects.toThrow(
        "HTTP 404",
      );
    });

    it("500 抛出错误", async () => {
      await expect(webFetch(`${baseUrl}/error`)).rejects.toThrow("HTTP 500");
    });

    it("无效 URL 抛出错误", async () => {
      await expect(
        webFetch("http://127.0.0.1:99999/nonexistent"),
      ).rejects.toThrow("请求失败");
    });

    it("超时抛出错误", async () => {
      await expect(
        webFetch(`${baseUrl}/slow`, { timeout: 100 }),
      ).rejects.toThrow("请求超时");
    });
  });

  describe("其他", () => {
    it("返回正确的 Content-Type 和 URL", async () => {
      const result = await webFetch(`${baseUrl}/json`);
      expect(result.contentType).toContain("application/json");
      expect(result.url).toBe(`${baseUrl}/json`);
    });

    it("跟随重定向", async () => {
      const result = await webFetch(`${baseUrl}/redirect`);
      expect(result.status).toBe(200);
      expect(result.url).toBe(`${baseUrl}/html`);
      expect(result.content).toContain("# Hello World");
    });

    it("自定义请求头", async () => {
      const result = await webFetch(`${baseUrl}/html`, {
        headers: { "X-Custom": "test" },
      });
      expect(result.status).toBe(200);
    });

    it("maxBytes 限制", async () => {
      await expect(
        webFetch(`${baseUrl}/large-json`, { maxBytes: 10 }),
      ).rejects.toThrow("响应体过大");
    });
  });
});
