import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export type FileMap = Map<string, string>;

/**
 * A base app or a feature overlay
 */
export interface Template {
  name: string;
  files: FileMap;
  packageJson: Record<string, any>;
  config: Record<string, any>;
  agents: string;
}

/**
 * Read every file under `dir`
 * @param dir - folder to read; a missing folder gives an empty map
 * @returns POSIX relative path → content
 */
export async function readTree(dir: string): Promise<FileMap> {
  const files: FileMap = new Map();
  if (!existsSync(dir)) return files;
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath ?? (entry as any).path, entry.name);
    files.set(relative(dir, full).split(sep).join("/"), await readFile(full, "utf8"));
  }
  return files;
}

/**
 * Read an optional JSON file
 * @param file - path
 * @returns parsed content, `{}` when the file does not exist
 */
async function readJson(file: string): Promise<Record<string, any>> {
  return existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
}

/**
 * Load a template folder: `files/`, `package.json`, `webda.config.json` and `agents.md`, all optional
 * @param dir - template folder
 * @param name - template name used in error messages
 * @returns the template
 */
export async function loadTemplate(dir: string, name: string): Promise<Template> {
  const agentsFile = join(dir, "agents.md");
  return {
    name,
    files: await readTree(join(dir, "files")),
    packageJson: await readJson(join(dir, "package.json")),
    config: await readJson(join(dir, "webda.config.json")),
    agents: existsSync(agentsFile) ? await readFile(agentsFile, "utf8") : ""
  };
}
