#!/usr/bin/env node
import yargs from "yargs";
import { WebdaProject } from "./definition";
import { Compiler } from "./compiler";
import { generateConfigurationSchemas, ConfigSchemaApplication } from "./configuration";
import { generateOperations } from "./operations";
import { useWorkerOutput, Fork, InteractiveConsoleLogger } from "@webda/workout";
import { FileUtils, listConfiguredServiceTypes } from "@webda/utils";
import { resolve, join } from "path";
import { runWithCurrentDirectory } from "@webda/utils";
import { existsSync, mkdirSync, readdirSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { bold, italic, yellow } from "yoctocolors";
import { WebdaMorpher } from "./morpher/morpher";
import {
  shouldDispatchBuildHooks,
  spawnWebdaBuild,
  WEBDA_BUILD_DISPATCH_ENV
} from "./shell-build-dispatch";

/**
 * Scan a single node_modules directory for webda.module.json files
 * @param dir - the node_modules directory path
 * @param mod - the module object to merge into
 * @param seen - set of already-visited directories
 */
function scanNodeModules(dir: string, mod: any, seen: Set<string>) {
  if (!existsSync(dir)) return;
  const scan = (current: string, depth: number = 0) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(current, entry.name);
      if (entry.name.startsWith("@") && depth === 0) {
        scan(full, depth + 1);
        continue;
      }
      let target = full;
      if (entry.isSymbolicLink()) {
        try {
          target = realpathSync(full);
          if (!lstatSync(target).isDirectory()) continue;
        } catch {
          continue;
        }
      } else if (!entry.isDirectory()) {
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      const modFile = join(target, "webda.module.json");
      if (!existsSync(modFile)) continue;
      try {
        const depMod = FileUtils.load(modFile, "json");
        // Merge moddas, deployers, and schemas (beans are only from the app itself)
        for (const section of ["moddas", "deployers", "schemas"] as const) {
          if (depMod[section]) {
            mod[section] = { ...mod[section], ...depMod[section] };
          }
        }
        // Capabilities: project values override dependencies
        if (depMod.capabilities) {
          mod.capabilities = { ...depMod.capabilities, ...mod.capabilities };
        }
      } catch {
        // Skip invalid modules
      }
    }
  };
  scan(dir);
}

/**
 * Scan node_modules for webda.module.json files and merge their
 * moddas, deployers, and schemas into the local module.
 * Walks up the directory tree to find hoisted packages (yarn workspaces).
 * @param projectPath - the project root path
 * @param mod - the module object to merge into
 */
function mergeDependencyModules(projectPath: string, mod: any) {
  const seen = new Set<string>();
  let current = resolve(projectPath);
  const root = resolve("/");
  while (current !== root) {
    scanNodeModules(join(current, "node_modules"), mod, seen);
    const parent = resolve(join(current, ".."));
    if (parent === current) break;
    current = parent;
  }
}

interface Arguments {
  appPath: string;
  _: string[];
}

interface BuildArguments extends Arguments {
  watch: boolean;
}

/**
 * Type guard for the "build" CLI command
 * @param argv - the parsed CLI arguments
 * @returns true if the command is "build"
 */
function isBuildCommand(argv: Arguments): argv is BuildArguments {
  return argv._[0] === "build";
}

interface CodeArguments extends Arguments {
  module: string[];
}
/**
 * Type guard for the "code" CLI command
 * @param argv - the parsed CLI arguments
 * @returns true if the command is "code"
 */
function isCodeCommand(argv: Arguments): argv is CodeArguments {
  return argv._[0] === "code";
}

const argv: Arguments = yargs(process.argv.slice(2))
  .command("build", "Build an application", yargs => {
    yargs
      .option("watch", {
        alias: "w",
        describe: "Watch the files for changes",
        type: "boolean",
        default: false
      })
      .option("code", {
        alias: "c",
        describe: "Prerun code before compiling"
      });
  })
  .command("code", "Analyzes the code and generate methods for you", yargs => {
    yargs.option("module", {
      describe: "Generate migration code",
      type: "array"
    });
  })
  .option("appPath", {
    describe: "Path to the application",
    type: "string",
    default: "."
  })
  .demandCommand(1, "You need to specify a command")
  .version()
  .help().argv as any;

const { appPath } = argv;
const targetDir = resolve(appPath || ".");
const command = argv._[0];

new InteractiveConsoleLogger(useWorkerOutput());
Fork(
  async () => {
    if (isCodeCommand(argv)) {
      const morpher = new WebdaMorpher();
      await morpher.check();
    } else if (isBuildCommand(argv)) {
      const project = new WebdaProject(targetDir, useWorkerOutput());
      project.on("compiling", () => {
        if (argv.watch) {
          process.stdout.write("\u001B[2J\u001B[0;0f");
          process.stdout.write(
            bold("web" + yellow("da") + ".io") +
              ` watch - ${project.packageDescription.name}@${project.packageDescription.version || "dev"} - ${italic(
                project.getAppPath()
              )}\n\n`
          );
        }
        useWorkerOutput().startActivity("Compiling…");
      });
      project.on("compilationError", () => {
        useWorkerOutput().stopActivity("error", "Error during compilation");
        if (!argv.watch) {
          process.exit(1);
        }
      });
      project.on("analyzing", () => {
        useWorkerOutput().startActivity("Analyzing…");
      });
      project.on("done", () => {
        if (!argv.watch) {
          useWorkerOutput().stopActivity("success", "web" + yellow("da") + ".module.json generated");
        } else {
          useWorkerOutput().stopActivity("success", "Watching for file changes…");
          //        useWorkerOutput().log("INFO", "Watching for file changes…");
        }
      });
      await runWithCurrentDirectory(targetDir, async () => {
        const compiler = new Compiler(project);
        if (argv.watch) {
          // Guard against accidental recursion if a build hook re-invokes webdac.
          const recursive = !!process.env[WEBDA_BUILD_DISPATCH_ENV];

          let building = false;
          let pending = false;

          const runHooksOnce = async () => {
            const modulePath = project.getAppPath("webda.module.json");
            if (!existsSync(modulePath)) return;
            const localMod = FileUtils.load(modulePath, "json");
            mergeDependencyModules(project.getAppPath(), localMod);
            const configPath = FileUtils.getConfigurationFile(project.getAppPath("webda.config"));
            const configuredTypes = listConfiguredServiceTypes(configPath, project.namespace);
            if (!shouldDispatchBuildHooks(localMod, configuredTypes)) return;
            const code = await spawnWebdaBuild(project.getAppPath());
            if (code !== 0) {
              useWorkerOutput().log("ERROR", `webda build exited with code ${code}`);
            }
          };

          const runHooks = async () => {
            if (building) {
              pending = true;
              return;
            }
            building = true;
            try {
              await runHooksOnce();
            } catch (err) {
              useWorkerOutput().log("ERROR", "Build hook dispatch failed", (err as Error).message);
            } finally {
              building = false;
              if (pending) {
                pending = false;
                // Run again — the source changed during the previous run.
                void runHooks();
              }
            }
          };

          if (!recursive) {
            project.on("done", () => {
              void runHooks();
            });
          }

          compiler.watch(() => {});
          await new Promise(() => {});
        } else {
          compiler.compile(true);
          // Generate configuration schemas if the project is an application
          if (project.isApplication()) {
            const modulePath = project.getAppPath("webda.module.json");
            const mod = FileUtils.load(modulePath, "json");
            mergeDependencyModules(project.getAppPath(), mod);

            // Generate configuration schemas
            try {
              const configPath = FileUtils.getConfigurationFile(project.getAppPath("webda.config"));
              const config = FileUtils.load(configPath);
              const namespace = project.namespace || "Webda";
              const app: ConfigSchemaApplication = {
                getModdas: () => mod.moddas || {},
                getSchema: (type: string) =>
                  mod.schemas?.[type] || mod.moddas?.[type]?.Schema || mod.beans?.[type]?.Schema || mod.deployers?.[type]?.Schema,
                getDeployers: () => mod.deployers || {},
                getConfiguration: () => config,
                getModules: () => mod,
                completeNamespace: (name: string) => (name.includes("/") ? name : `${namespace}/${name}`)
              };
              generateConfigurationSchemas(app, undefined, undefined, undefined, configPath);
            } catch (err) {
              useWorkerOutput().log("WARN", "Cannot generate configuration schemas", err.message);
            }

            // Generate operations.json
            try {
              const operations = generateOperations(mod);
              const webdaDir = project.getAppPath(".webda");
              if (!existsSync(webdaDir)) {
                mkdirSync(webdaDir, { recursive: true });
              }
              writeFileSync(join(webdaDir, "operations.json"), JSON.stringify(operations, undefined, 2));
              useWorkerOutput().log("INFO", "Generated .webda/operations.json");
            } catch (err) {
              useWorkerOutput().log("WARN", "Cannot generate operations.json", err.message);
            }

            // Build-hook dispatch: if any configured service declares a `build`
            // command, spawn `webda build` to run the hooks.
            // If WEBDA_BUILD_DISPATCH is set, we are already the child of an
            // outer `webdac build` — skip to break any accidental fork loop
            // (e.g. a user's build hook that re-invokes `webdac build`).
            if (!process.env[WEBDA_BUILD_DISPATCH_ENV]) {
              const configPath = FileUtils.getConfigurationFile(project.getAppPath("webda.config"));
              const configuredTypes = listConfiguredServiceTypes(configPath, project.namespace);
              if (shouldDispatchBuildHooks(mod, configuredTypes)) {
                useWorkerOutput().log("INFO", "Running build hooks (webda build)…");
                const code = await spawnWebdaBuild(project.getAppPath());
                if (code !== 0) {
                  useWorkerOutput().log("ERROR", `webda build exited with code ${code}`);
                  process.exit(code);
                }
              }
            }
          }
        }
      });
    }
  },
  () => {
    //new InteractiveConsoleLogger(useWorkerOutput(), "WARN");
  }
).catch(err => {
  process.exit(1);
});
