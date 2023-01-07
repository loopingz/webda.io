import { CronDefinition, CronService, FileUtils } from "@webda/core";
import { mkdirSync } from "fs";
import { extname, join } from "path";
import { CronReplace } from "./cron";

export class KubernetesShell {
  static async shellCommand(Console, args) {
    if (args.cronExport) {
      // @ts-ignore
      const shellModule = <any>await import("@webda/shell");
      const target = args.target || "./crons";
      let template = args.template;
      let ext;
      if (template) {
        ext = extname(template).substring(1);
        template = FileUtils.load(template);
      } else {
        template = shellModule.K8S_DEFAULT_CRON_DEFINITION;
        ext = "yaml";
      }
      // Dynanically import
      Console.webda = new shellModule.WebdaServer(Console.app);
      Console.webda.initStatics();
      mkdirSync(target, { recursive: true });
      const crons = CronService.loadAnnotations(Console.webda.getServices());
      crons.forEach((cron: CronDefinition & { cronId: string }) => {
        cron.cronId = CronService.getCronId(cron, "export");
        const filename = join(target, `${cron.serviceName}.${cron.method}-${cron.cronId}.${ext}`);
        Console.log("DEBUG", `Exporting ${filename} cron with ${cron.toString()}`);
        FileUtils.save(CronReplace(template, cron, Console.app), filename);
      });
      Console.log("INFO", `Exported ${crons.length} crons`);
    }
  }
}

/**
 * Create the command line parser
 *
 * @param y
 * @returns
 */
function yargs(y) {
  return y.command("cronExport [template] [targetDir]", "Export all application Cron as template");
}

const ShellCommand = KubernetesShell.shellCommand;

export { ShellCommand, yargs };
