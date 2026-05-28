import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type CreateAgentSessionResult,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

export interface ContextOptions {
  cwd?: string;
}

export type Context = CreateAgentSessionResult;

const deepseekHarness = join(import.meta.dirname, "../../");

export async function createContext(
  options?: ContextOptions,
): Promise<CreateAgentSessionResult> {
  const cwd = options?.cwd ?? process.cwd();

  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const sessionManager = SessionManager.create(cwd, ".pi/sessions");

  const ctx = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    sessionManager,
    settingsManager: SettingsManager.inMemory({
      packages: [deepseekHarness],
      defaultProvider: "deepseek",
      defaultModel: "deepseek-v4-flash",
      defaultThinkingLevel: "off",
    }),
  });

  console.log(
    `pi session started.
${JSON.stringify(
  {
    cwd: cwd,
    logFile: `./${ctx.session.sessionFile}`,
  },
  null,
  2,
)}
`,
  );

  return ctx;
}
