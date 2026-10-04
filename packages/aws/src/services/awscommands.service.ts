import { Command, Service } from "@webda/core";
import { useWorkerOutput } from "@webda/workout";
import { DynamoStore } from "./dynamodb.service.js";
import { Route53Service } from "./route53.service.js";

/**
 * AWS command line utilities
 *
 * Exposes the `webda aws route53 export|import|sync` and `webda aws copyTable` commands
 *
 * @WebdaModda
 */
export class AWSCommands extends Service {
  /**
   * Export a Route53 domain to a file
   *
   * @param domain - the domain to export
   * @param file - the file to export to (.json or .yml)
   */
  @Command("aws route53 export", {
    description: "Export a Route53 domain to a json file",
    requires: ["aws-commands"],
    phase: "resolved"
  })
  async route53Export(domain: string, file: string): Promise<void> {
    await Route53Service.export(domain, file);
  }

  /**
   * Import a Route53 exported file to Route53
   *
   * @param file - the exported file
   */
  @Command("aws route53 import", {
    description: "Import a Route53 exported format to Route53",
    requires: ["aws-commands"],
    phase: "resolved"
  })
  async route53Import(file: string): Promise<void> {
    await Route53Service.import({ file }, this.log.bind(this));
  }

  /**
   * Sync a Route53 exported file to Route53, removing any other entries
   *
   * @param file - the exported file
   * @param pretend - only display the entries that would be removed
   */
  @Command("aws route53 sync", {
    description: "Sync a Route53 exported format to Route53 (remove all others entries)",
    requires: ["aws-commands"],
    phase: "resolved"
  })
  async route53Sync(file: string, pretend: boolean = false): Promise<void> {
    await Route53Service.import({ file, pretend, sync: true }, this.log.bind(this));
  }

  /**
   * Copy all items of a DynamoDB table into another one
   *
   * @param sourceTable - the table to copy from
   * @param targetTable - the table to copy to
   */
  @Command("aws copyTable", {
    description: "Copy a DynamoDB table content to another table",
    requires: ["aws-commands"],
    phase: "resolved"
  })
  async copyTable(sourceTable: string, targetTable: string): Promise<void> {
    await DynamoStore.copyTable(useWorkerOutput(), sourceTable, targetTable);
  }
}

export default AWSCommands;
