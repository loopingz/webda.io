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
        if (args._.length < 2) {
          Console.logger.log("ERROR", "Require sourceTable and targetTable");
          return 1;
        }
        DynamoStore.copyTable(Console.app.getWorkerOutput(), args._[0], args._[1]);
        return 0;
      default:
        Console.logger.log("ERROR", `Unknown command ${command}`);
        return 1;
    }
  }
}

const ShellCommand = AWSShell.shellCommand;

export { ShellCommand };