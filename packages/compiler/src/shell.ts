#!/usr/bin/env node --experimental-default-type=module
import yargs from "yargs";
import { WebdaProject } from "./definition";
import { Compiler } from "./compiler";
import { useWorkerOutput, ConsoleLogger, useLog, MemoryLogger, LogFilter, WorkerOutput } from "@webda/workout";
import { resolve } from "path";
import { runWithCurrentDirectory } from "@webda/utils";
import { fork } from "child_process";
import yoctoSpinner from "yocto-spinner";
import { bold, italic, yellow } from "yoctocolors";

interface Arguments {
  appPath: string;
  watch: boolean;
}

//new ConsoleLogger(useWorkerOutput());
const argv: Arguments = yargs(process.argv.slice(2))
  .command("$0 [appPath]", "Launch a command", yargs => {
    yargs.positional("appPath", {
      describe: "Path to the application",
      type: "string",
      default: "."
    });
  })
  .option("watch", {
    alias: "w",
    describe: "Watch the files for changes",
    type: "boolean",
    default: false
  })
  .version()
  .help().argv as any;

const { appPath } = argv;
const targetDir = resolve(appPath || ".");

if (process.env["FORKED"]) {
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
} else {
  const spinner = yoctoSpinner({ color: "yellow" });
  const args = ["--appPath", argv.appPath];
  if (argv.watch) {
    args.push("--watch");
  }
  const child = fork(process.argv[1], args, { env: { FORKED: "true" } });
  const project = new WebdaProject(targetDir, useWorkerOutput());
  child.on("message", message => {
    if (typeof message === "string" && message.startsWith("logs:")) {
      spinner.error("Error during compilation");
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
            ` watch - ${project.packageDescription.name}@${project.packageDescription.version || "dev"} - ${italic(project.getAppPath())}\n\n`
        );
      }
      spinner.start("Compiling…");
    } else if (message === "analyzing") {
      spinner.start("Analyzing…");
    } else if (message === "end") {
      let info = "web" + yellow("da") + ".module.json generated";
      if (argv.watch) {
        info += " - " + italic(new Date().toLocaleTimeString());
      }
      spinner.success(info);
    }
  });
}
