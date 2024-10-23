#!/usr/bin/env node --experimental-default-type=module
import yargs from "yargs";
import { WebdaProject } from "./definition";
import { Compiler } from "./compiler";
import {
  useWorkerOutput,
  ConsoleLogger,
  useLog,
  MemoryLogger,
  LogFilter,
  WorkerOutput,
  InteractiveConsoleLogger
} from "@webda/workout";
import { resolve } from "path";
import { runWithCurrentDirectory } from "@webda/utils";
import { fork } from "child_process";
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

new InteractiveConsoleLogger(useWorkerOutput(), "WARN");
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

if (isCodeCommand(argv)) {
  console.log("Not implemented yet", argv.module);
  process.exit(0);
}
if (process.env["FORKED"] && isBuildCommand(argv)) {
  const logger = new MemoryLogger(useWorkerOutput());
  const project = new WebdaProject(targetDir, useWorkerOutput());
  project.on("compiling", () => {
    process.send("compiling");
  });
  project.on("compilationError", () => {
    process.send("logs:" + JSON.stringify(logger.getLogs().filter(l => l.log && LogFilter(l.log.level, "WARN"))));
  });
  project.on("analyzing", () => {
    process.send("analyzing");
  });
  project.on("done", () => {
    process.send("end");
  });
  runWithCurrentDirectory(targetDir, async () => {
    const compiler = new Compiler(project);
    if (argv.watch) {
      compiler.watch(() => {});
    } else {
      compiler.compile();
    }
  });
} else if (isBuildCommand(argv)) {
  const args = [command, "--appPath", argv.appPath];
  if (argv.watch) {
    args.push("--watch");
  }
  const child = fork(process.argv[1], args, { env: { FORKED: "true" } });
  const project = new WebdaProject(targetDir, useWorkerOutput());
  child.on("message", async message => {
    if (typeof message === "string" && message.startsWith("logs:")) {
      useWorkerOutput().stopActivity("error", "Error during compilation");
      const logs = JSON.parse(message.substring(5));
      logs.forEach((log: any) => {
        console.log(log.log.args.join(" ") + "\n");
      });
      if (!argv.watch) {
        process.exit(1);
      }
    } else if (message === "compiling") {
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
    } else if (message === "analyzing") {
      useWorkerOutput().startActivity("Analyzing…");
    } else if (message === "end") {
      await new Promise(resolve => setTimeout(resolve, 5000));
      let info = "web" + yellow("da") + ".module.json generated";
      if (argv.watch) {
        info += " - " + italic(new Date().toLocaleTimeString());
      }
      useWorkerOutput().stopActivity("success", info);
    }
  });
}
