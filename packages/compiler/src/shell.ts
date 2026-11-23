#!/usr/bin/env node
import yargs from "yargs";
import { WebdaProject } from "./definition.js";
import { Compiler } from "./compiler.js";
import { generateConfigurationSchemas, ConfigSchemaApplication } from "./configuration.js";
import { generateOperations } from "./operations.js";
import { useWorkerOutput, Fork, InteractiveConsoleLogger } from "@webda/workout";
import { FileUtils, listConfiguredServiceTypes } from "@webda/utils";
import { resolve, join } from "path";
import { runWithCurrentDirectory } from "@webda/utils";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { bold, italic, red, yellow } from "yoctocolors";
import { WebdaMorpher } from "./morpher/morpher.js";
import { shouldDispatchBuildHooks, spawnWebdaBuild, WEBDA_BUILD_DISPATCH_ENV } from "./shell-build-dispatch.js";
import { writeCliBinForBuild } from "./cli-bin.js";
import { lintProject, mergeDependencyModules } from "./linter.js";

/**
 * Arguments interface
 */
interface Arguments {
  /**
   * App path
   */
  appPath: string;
  /**
   * Internal value
   */
  _: string[];
}

/**
 * Build arguments interface
 */
interface BuildArguments extends Arguments {
  /**
   * Whether watch is enabled
   */
  watch: boolean;
  /**
   * Whether force is enabled
   */
  force: boolean;
}

/**
 * Type guard for the "build" CLI command
 * @param argv - the parsed CLI arguments
 * @returns true if the command is "build"
 */
function isBuildCommand(argv: Arguments): argv is BuildArguments {
  return argv._[0] === "build";
}

/**
 * Code arguments interface
 */
interface CodeArguments extends Arguments {
  /**
   * Module
   */
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

/**
 * Lint arguments interface
 */
interface LintArguments extends Arguments {
  /**
   * Fail on warnings as well as errors
   */
  strict: boolean;
  /**
   * Output format
   */
  format: "text" | "json";
}

/**
 * Type guard for the "lint" CLI command
 * @param argv - the parsed CLI arguments
 * @returns true if the command is "lint"
 */
function isLintCommand(argv: Arguments): argv is LintArguments {
  return argv._[0] === "lint";
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
      .option("force", {
        alias: "f",
        describe: "Recompile even when the cache reports nothing changed",
        type: "boolean",
        default: false
      });
  })
  .command("code", "Migrate the application sources to the current Webda version", yargs => {
    yargs.option("module", {
      describe: "Run only these migration modules",
      type: "array"
    });
  })
  .command("lint", "Lint Webda project configuration, models, and operations", yargs => {
    yargs
      .option("strict", {
        describe: "Treat warnings as errors",
        type: "boolean",
        default: false
      })
      .option("format", {
        describe: "Output format (text or json)",
        choices: ["text", "json"],
        default: "text"
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

new InteractiveConsoleLogger(useWorkerOutput());
Fork(
  async () => {
    if (isLintCommand(argv)) {
      const result = lintProject(targetDir);
      if (argv.format === "json") {
        process.stdout.write(JSON.stringify(result, undefined, 2) + "\n");
      } else {
        for (const issue of result.issues) {
          const badge =
            issue.severity === "error" ? red("error") : issue.severity === "warn" ? yellow("warn ") : italic("info ");
          const loc = issue.file ? `${issue.file} ` : "";
          process.stdout.write(`${badge} [${issue.rule}] ${loc}${issue.message}\n`);
        }
        process.stdout.write(
          `\nSummary: ${result.errors} error(s), ${result.warnings} warning(s), ${result.infos} info(s)\n`
        );
      }
      if (result.errors > 0 || (argv.strict && result.warnings > 0)) {
        process.exit(1);
      }
    } else if (isCodeCommand(argv)) {
      const morpher = new WebdaMorpher({
        project: { tsConfigFilePath: join(targetDir, "tsconfig.json") },
        modules: argv.module?.map(String)
      });
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
        // The application executable declared by the "webda.cli" section of package.json
        writeCliBinForBuild(project.getAppPath(), project.packageDescription);
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
          const needsCompilation = argv.force || compiler.requireCompilation();
          compiler.compile(argv.force);
          if (!needsCompilation) {
            useWorkerOutput().log("INFO", "Cache up-to-date; skipping build (pass --force to recompile)");
          }
          // Generate configuration schemas if the project is an application
          if (needsCompilation && project.isApplication()) {
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
                  mod.schemas?.[type] ||
                  mod.moddas?.[type]?.Schema ||
                  mod.beans?.[type]?.Schema ||
                  mod.deployers?.[type]?.Schema,
                getDeployers: () => mod.deployers || {},
                getConfiguration: () => config,
                getModules: () => mod,
                completeNamespace: (name: string) => (name.includes("/") ? name : `${namespace}/${name}`)
              };
              generateConfigurationSchemas(app, undefined, undefined, undefined, configPath);
            } catch (err) {
              useWorkerOutput().log(
                "WARN",
                "Cannot generate configuration schemas",
                err instanceof Error ? err.message : String(err)
              );
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
              useWorkerOutput().log(
                "WARN",
                "Cannot generate operations.json",
                err instanceof Error ? err.message : String(err)
              );
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
