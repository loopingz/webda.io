import yargs from "yargs";
import { WebdaProject } from "./definition";
import { Compiler } from "./compiler";
import { useWorkerOutput, ConsoleLogger, useLog } from "@webda/workout";
import { resolve } from "path";

interface Arguments {
  appPath: string;
  watch: boolean;
}

new ConsoleLogger(useWorkerOutput());
const argv: Arguments = yargs(process.argv.slice(2))
  .command("$0 <appPath>", "Launch a command", yargs => {
    yargs.positional("appPath", {
      describe: "Path to the application",
      type: "string"
    });
  })
  .option("watch", {
    alias: "w",
    describe: "Watch the files for changes",
    type: "boolean"
  })
  .help().argv as any;

/**
 *
 * @param dir
 * @param cb
 * @returns
 */
function runWithCurrentDirectory(dir: string, cb: () => any) {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const res = cb();
    if (res instanceof Promise) {
      return res
        .catch(err => {
          useLog("ERROR", err);
        })
        .finally(() => {
          process.chdir(cwd);
        });
    }
    return res;
  } catch (err) {
    useLog("ERROR", err);
  } finally {
    process.chdir(cwd);
  }
}

const { appPath } = argv;
const targetDir = resolve(appPath);
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
