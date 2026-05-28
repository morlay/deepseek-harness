import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

export async function workingDir(name: string, opt: { root?: string } = {}) {
  const root = opt.root ?? (await mkdtemp(join(tmpdir(), name)));

  return {
    get root() {
      return root;
    },

    async putFiles(files: Record<string, string>) {
      for (const [name, content] of Object.entries(files)) {
        const filePath = join(root, name);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");
      }
    },

    async cleanup() {
      return rm(root, { recursive: true, force: true });
    },
  };
}

export type WorkingDir = Awaited<ReturnType<typeof workingDir>>;
