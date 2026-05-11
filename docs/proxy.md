# 透明代理

仅用于 E2E 测试和本地调试。非生产组件。

`src/testing/proxy.ts` — 启动本地 HTTP 代理，转发请求到上游 LLM API，同时捕获对话记录。

## 功能

- 启动本地 HTTP 代理，转发所有请求到上游 LLM API
- 自动捕获 `POST /chat/completions` 的完整请求体和响应体
- 合并 SSE stream 分片为完整响应对象（content、reasoning_content、tool_calls）
- 服务停止时写入 `logs/log-{datetime}.jsonl`，每行一条完整对话

## 配置

```ts
const proxy = new LlmProxy(upstreamUrl, logDir);
await proxy.start();
// 将 provider baseURL 指向 proxy.url
// ...
await proxy.close(); // flush to JSONL
```

- `upstreamUrl`：上游 API 地址，默认 `E2E_UPSTREAM_URL` 或 `https://api.deepseek.com`
- `logDir`：日志输出目录，默认项目根 `logs/`

## 日志格式

```json
{"timestamp":"...","request":{"method":"POST","path":"/chat/completions","body":{...}},"response":{"statusCode":200,"body":{...}}}
```

## 诊断日志

代理输出带 `[llm-proxy]` 前缀的日志，覆盖启动、请求状态、异常和落盘：

- `listening on {url} -> {upstream}` — 启动
- `captured chat {statusCode}` — 请求通过
- `upstream {statusCode} for {method} {path}` — 上游非 2xx
- `upstream error: {message}` — 连接失败
- `flushed {N} chats -> {path}` — 落盘成功
- `no chats captured, skipping flush` — 无数据
