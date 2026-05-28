import { describe, it, beforeAll, afterAll } from "vitest";
import { createContext, type Context } from "../context.ts";

describe.runIf(process.env.DEBUG == "1")("debug", () => {
  let ctx: Context;

  beforeAll(async () => {
    ctx = await createContext();

    ctx.session.subscribe((evt) => {
      if (evt.type != "message_update") {
        console.log(evt.type);
      }
    });
  });

  afterAll(async () => {
    ctx.session.dispose();
  });

  it("打个招呼", async () => {
    await ctx.session.prompt("读一下 mise.toml");
  });
});
