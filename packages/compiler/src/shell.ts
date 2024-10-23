#!/usr/bin/env node --experimental-default-type=module
import yargs from "yargs";
import { WebdaProject } from "./definition";
import { Compiler } from "./compiler";
import { useWorkerOutput, Fork, InteractiveConsoleLogger } from "@webda/workout";
import { resolve } from "path";
import { runWithCurrentDirectory } from "@webda/utils";
import { bold, italic, yellow } from "yoctocolors";

interface Arguments {
  appPath: string;
  _: string[];
}

interface BuildArguments extends Arguments {
  watch: boolean;
}

function isBuildCommand(argv: Arguments): argv is BuildArguments {
  return argv._[0] === "build";
}

interface CodeArguments extends Arguments {
  module: string[];
}
function isCodeCommand(argv: Arguments): argv is CodeArguments {
  return argv._[0] === "code";
}

const argv: Arguments = yargs(process.argv.slice(2))
  .command("build", "Build an application", yargs => {
    yargs.option("watch", {
      alias: "w",
      describe: "Watch the files for changes",
      type: "boolean",
      default: false
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

Fork(
  async () => {
    if (isCodeCommand(argv)) {
      console.log("Not implemented yet", argv.module);
      process.exit(0);
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
          compiler.watch(() => {});
          await new Promise(() => {});
        } else {
          compiler.compile();
        }
      });
    }
  },
  () => {
    new InteractiveConsoleLogger(useWorkerOutput(), "WARN");
  }
).catch(err => {
  process.exit(1);
});
