import CloudFormationDeployer from "./deployers/cloudformation";
import { DynamoStore } from "./services/dynamodb";
import { Route53Service } from "./services/route53";

export class AWSShell {
  static async shellCommand(Console, args) {
    let command = args._.shift();
    switch (command) {
      case "init":
        return CloudFormationDeployer.init(Console);
      case "route53":
        return Route53Service.shell(Console, args);
      case "copyTable":
        DynamoStore.copyTable(Console.app.getWorkerOutput(), args.sourceTable, args.targetTable);
        return 0;
      default:
        Console.logger.log("ERROR", `Unknown command ${command}`);
        return 1;
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
  return y
    .command("init", "Initiate a module")
    .command("route53 <subcommand>", "Import or export DNS", y2 => {
      return y2
        .command("export <domain> <file>", "Export a Route53 domain to a json file")
        .command("import <file>", "Import a Route53 exported format to Route53");
    })
    .command("copyTable <sourceTable> <targetTable>", "Import or export DNS");
}

const ShellCommand = AWSShell.shellCommand;

export { ShellCommand, yargs };
