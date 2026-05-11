import { createOpencode, type Session } from "@opencode-ai/sdk/v2";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { LlmProxy } from "./proxy.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pluginPath = join(__dirname, "..", "index.ts");
const logDir = join(__dirname, "..", "..", "logs");

export const PROVIDER = process.env.E2E_PROVIDER ?? "deepseek";
export const MODEL = process.env.E2E_MODEL_ID ?? "deepseek-v4-flash";
export const UPSTREAM =
  process.env.E2E_UPSTREAM_URL ?? "https://api.deepseek.com";

export { type Session };

export async function createContext() {
  const proxy = new LlmProxy(UPSTREAM, logDir);
  await proxy.start();

  const oc = await (async () => {
    try {
      const oc = await createOpencode({
        port: Math.floor(4096 + Math.random() * (65535 - 4096)),
        config: {
          plugin: [pluginPath],
          agent: {
            build: { disable: true },
            explore: { disable: true },
            general: { disable: true },
            plan: { disable: true },
          },
          provider: {
            [PROVIDER]: {
              options: {
                baseURL: proxy.url,
                apiKey: process.env.DEEPSEEK_API_KEY,
              },
            },
          },
        },
      });

      return oc;
    } catch (err) {
      console.error(err);
      throw err;
    }
  })();

  return {
    close: async () => {
      oc.server.close();
      await proxy.close();
    },

    createSession: async (opt?: { directory?: string }): Promise<Session> => {
      const resp = await oc.client.session.create({
        model: { providerID: PROVIDER, id: MODEL },
        directory: opt?.directory,
      });

      if (!resp.data) {
        console.error(
          "session.create 完整响应:",
          JSON.stringify(resp, null, 2),
        );

        throw `${JSON.stringify(resp.error)}`;
      }

      return resp.data;
    },

    promptText: async (session: Session, text: string, agent = "code") => {
      const resp = await oc.client.session.prompt({
        directory: session.directory,
        sessionID: session.id,
        agent,
        parts: [{ type: "text", text }],
      });

      if (!resp.data) {
        throw resp.error;
      }

      if (resp.data.info.error) {
        throw resp.data.info.error;
      }

      return resp.data;
    },

    messages: async (session: Session) => {
      const resp = await oc.client.session.messages({
        sessionID: session.id,
      });

      if (!resp.data) {
        throw resp.error;
      }

      return resp.data;
    },
  };
}
