import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describeApp, renderAgentsMd } from "./agents.js";
import { compose, overlayNames } from "./compose.js";
import { CreateOptions, OptionsError, toPackageName } from "./options.js";
import { FileMap, loadTemplate, readTree } from "./template.js";
import { applyVersions, VersionResolver } from "./versions.js";

/** npm 10 (bundled with Node 22) crashes resolving the optional peers of vitest/vite */
export const NPMRC = `# npm 10 crashes on the optional peer dependencies of vitest/vite: safe to remove with npm >= 11
legacy-peer-deps=true
`;

/**
 * Rename `_gitignore` files and replace `__TOKEN__` placeholders
 * @param files - generated files
 * @param tokens - token name (without underscores) → value
 * @returns a new map
 */
export function finalizePaths(files: FileMap, tokens: Record<string, string>): FileMap {
  const out: FileMap = new Map();
  for (const [path, content] of files) {
    const finalPath = path.replace(/(^|\/)_gitignore$/, "$1.gitignore");
    let finalContent = content;
    for (const [name, value] of Object.entries(tokens)) {
      finalContent = finalContent.replaceAll(`__${name}__`, value);
    }
    out.set(finalPath, finalContent);
  }
  return out;
}

/**
 * Fail when `dir` exists and is not empty
 * @param dir - target directory
 */
export function checkTarget(dir: string): void {
  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    throw new OptionsError(`${dir} exists and is not a directory`);
  }
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new OptionsError(`${dir} already exists and is not empty`);
  }
}

/**
 * Compose the application files in memory
 * @param input - options, template folders and version resolver
 * @param input.options - application creation options
 * @param input.templatesDir - path to template directories
 * @param input.agentDir - path to agent directory
 * @param input.resolveVersion - function to resolve package versions
 * @returns relative path → content
 */
export async function generate(input: {
  options: CreateOptions;
  templatesDir: string;
  agentDir: string;
  resolveVersion: VersionResolver;
}): Promise<FileMap> {
  const { options, templatesDir, agentDir } = input;
  const base = await loadTemplate(join(templatesDir, "base"), "base");
  const overlays = await Promise.all(
    overlayNames(options.store, options.transports).map(name =>
      loadTemplate(join(templatesDir, "features", name), name)
    )
  );
  const composed = compose(base, overlays, { rest: options.transports.includes("rest") });
  const appName = toPackageName(basename(options.dir));
  const pkg = composed.packageJson;
  applyVersions(pkg, input.resolveVersion);
  const files: FileMap = new Map(composed.files);
  files.set("package.json", JSON.stringify(pkg, null, 2) + "\n");
  if (options.pm === "npm") files.set(".npmrc", NPMRC);
  files.set("webda.config.json", JSON.stringify(composed.config, null, 2) + "\n");
  const agentsTemplate = await readFile(join(agentDir, "AGENTS.md"), "utf8");
  files.set("AGENTS.md", renderAgentsMd(agentsTemplate, describeApp(options), composed.agentNotes));
  files.set("CLAUDE.md", await readFile(join(agentDir, "CLAUDE.md"), "utf8"));
  for (const [path, content] of await readTree(join(agentDir, "skills"))) {
    files.set(`.agents/skills/${path}`, content);
  }
  return finalizePaths(files, { APP_NAME: appName, NAMESPACE: options.namespace });
}

/**
 * Write generated files under `dir`
 * @param dir - target directory, created when missing
 * @param files - relative path → content
 */
export async function writeFiles(dir: string, files: FileMap): Promise<void> {
  for (const [path, content] of files) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}
