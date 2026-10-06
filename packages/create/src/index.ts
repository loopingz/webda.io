import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTarget, generate, writeFiles } from "./generate.js";
import { initGit, installDependencies, Runner, spawnRunner } from "./install.js";
import { OptionsError, parseCliArgs } from "./options.js";
import { clackPrompter, Prompter, resolveOptions } from "./prompts.js";
import { fromVersionsFile, fromWorkspace } from "./versions.js";

export interface MainDeps {
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  interactive: boolean;
  prompter: Prompter;
  run: Runner;
  log: (message: string) => void;
  templatesDir: string;
  agentDir: string;
  versions: Record<string, string>;
}

const HELP = `Usage: npm create @webda <directory> [-- options]

  --store memory|file|mongodb|postgres   default memory
  --transports rest,graphql,grpc,mcp     default rest
  --namespace <PascalCase>               default from the directory name
  --pm pnpm|npm|yarn                     default: the package manager running this command
  --no-install                           skip dependency installation
  --no-git                               skip git init
  -y, --yes                              accept defaults, never prompt`;

/**
 * Run the CLI
 * @param deps - environment, injectable for tests
 * @returns process exit code
 */
export async function main(deps: MainDeps): Promise<number> {
  try {
    const args = parseCliArgs(deps.argv);
    if (args.help) {
      deps.log(HELP);
      return 0;
    }
    const options = await resolveOptions(args, {
      interactive: deps.interactive && !args.yes,
      prompter: deps.prompter,
      cwd: deps.cwd,
      userAgent: deps.env.npm_config_user_agent
    });
    checkTarget(options.dir);
    const resolveVersion = options.linkWorkspace
      ? await fromWorkspace(options.linkWorkspace)
      : fromVersionsFile(deps.versions);
    const files = await generate({ options, templatesDir: deps.templatesDir, agentDir: deps.agentDir, resolveVersion });
    await writeFiles(options.dir, files);
    deps.log(`Created ${options.dir}`);
    if (options.install && !installDependencies(options.pm, options.dir, deps.run)) {
      deps.log(`Installing dependencies failed. Retry with: cd ${options.dir} && ${options.pm} install`);
      return 1;
    }
    if (options.git) {
      const git = initGit(options.dir, deps.run);
      if (git === "missing") deps.log("git not found: skipped repository initialization");
      if (git === "failed") deps.log("git commands failed: skipped the initial commit");
    }
    const cd = relative(deps.cwd, options.dir) || ".";
    deps.log(
      [
        "Next steps:",
        `  cd ${cd}`,
        `  ${options.pm} run debug        # http://localhost:18080`,
        "Open the project in your coding agent: it reads AGENTS.md; skills are in .agents/skills/"
      ].join("\n")
    );
    return 0;
  } catch (err) {
    if (err instanceof OptionsError) {
      deps.log(err.message);
      return 1;
    }
    throw err;
  }
}

/**
 * Dependencies for a real run
 * @returns deps using the process, clack prompts and the packaged templates
 */
export async function defaultDeps(): Promise<MainDeps> {
  const versionsFile = fileURLToPath(new URL("./versions.json", import.meta.url));
  return {
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompter: clackPrompter,
    run: spawnRunner,
    log: message => console.log(message),
    templatesDir: fileURLToPath(new URL("../templates", import.meta.url)),
    agentDir: fileURLToPath(new URL("../agent", import.meta.url)),
    versions: JSON.parse(await readFile(versionsFile, "utf8"))
  };
}
