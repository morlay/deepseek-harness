import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, join, isAbsolute } from "node:path";
import { execSync } from "node:child_process";

export interface TempDir {
  readonly path: string;
  putFiles(files: Record<string, string>): Promise<void>;
  readFile(name: string): Promise<string>;
  destroy(): Promise<void>;
}

export async function createTempDir(
  baseDir: string,
  topic: string,
): Promise<TempDir> {
  const _path = join(baseDir, ".tmp", topic);
  let _inited = false;

  const ensure = async () => {
    await rm(_path, { recursive: true, force: true });
    await mkdir(_path, { recursive: true });
  };

  await ensure();

  execSync("git init -q", { cwd: _path, stdio: "ignore" });

  return {
    get path() {
      return _path;
    },

    async putFiles(files: Record<string, string>) {
      for (const [name, content] of Object.entries(files)) {
        const filePath = isAbsolute(name) ? name : join(_path, name);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content);
      }
    },

    async readFile(name: string) {
      return await readFile(join(_path, name), "utf-8");
    },

    async destroy() {
      await rm(_path, { recursive: true, force: true });
    },
  };
}
