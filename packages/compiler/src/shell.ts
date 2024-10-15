#!/usr/bin/env node --experimental-default-type=module
import yargs from "yargs";
import { WebdaProject } from "./definition";
import { Compiler } from "./compiler";
import { useWorkerOutput, ConsoleLogger, useLog } from "@webda/workout";
import { resolve } from "path";
import { runWithCurrentDirectory } from "@webda/utils";

interface Arguments {
  appPath: string;
  watch: boolean;
}

new ConsoleLogger(useWorkerOutput());
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
const start = Date.now();
const project = new WebdaProject(targetDir, useWorkerOutput());
runWithCurrentDirectory(targetDir, () => {
  const compiler = new Compiler(project);
  if (argv.watch) {
    compiler.watch(() => {});
  } else {
    compiler.compile();
  }
});
useLog("INFO", "Took", Date.now() - start, "ms");
