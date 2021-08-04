import { Service, Cache, JSONUtils } from "@webda/core";
import * as AWS from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";

export class Route53Service extends Service {
  /**
   * Get the closest zone to the domain
   *
   * @param domain to get zone for
   */
  @Cache()
  static async getZoneForDomainName(domain): Promise<AWS.Route53.HostedZone> {
    if (!domain.endsWith(".")) {
      domain = domain + ".";
    }
    let targetZone: AWS.Route53.HostedZone;
    // Find the right zone
    let r53: AWS.Route53 = new AWS.Route53();
    let res: AWS.Route53.ListHostedZonesResponse;
    let params: AWS.Route53.ListHostedZonesRequest = {};
    // Identify the right zone first
    do {
      res = await r53.listHostedZones(params).promise();
      for (let i in res.HostedZones) {
        let zone = res.HostedZones[i];
        if (domain.endsWith(zone.Name)) {
          if (targetZone && targetZone.Name.length > zone.Name.length) {
            // The previous target zone is closer to the domain
            continue;
          }
          targetZone = zone;
        }
      }
      params.Marker = res.NextMarker;
    } while (!targetZone && res.NextMarker);
    return targetZone;
  }

  /**
   * Create DNS entry
   *
   * @param domain to create
   * @param type of DNS
   * @param value the value of the record
   * @param targetZone
   */
  static async createDNSEntry(
    domain: string,
    type: string,
    value: string,
    targetZone: AWS.Route53.HostedZone = undefined,
    Comment: string = "@webda/aws-created"
  ): Promise<void> {
    let r53 = new AWS.Route53();
    if (!domain.endsWith(".")) {
      domain = domain + ".";
    }
    if (!targetZone) {
      targetZone = await this.getZoneForDomainName(domain);
    }
    if (!targetZone) {
      throw Error("Domain is not handled on AWS");
    }
    await r53
      .changeResourceRecordSets({
        HostedZoneId: targetZone.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: domain,
                ResourceRecords: [
                  {
                    Value: value
                  }
                ],
                TTL: 360,
                Type: type
              }
            }
          ],
          Comment
        }
      })
      .promise();
  }

  /**
   * Return all entries of a zone in AWS
   *
   * @param domain to retrieve from
   */
  static async getEntries(domain: string) {
    let r53 = new AWS.Route53();
    const DNSName = domain.split(".").reverse().join(".");
    const zone = await Route53Service.getZoneForDomainName(domain);
    if (!zone) {
      throw new Error(`Zone cannot be found: ${domain}`);
    }
    const result = [];
    let res: PromiseResult<AWS.Route53.ListResourceRecordSetsResponse, AWS.AWSError>;
    do {
      res = await r53
        .listResourceRecordSets({
          HostedZoneId: zone.Id,
          StartRecordIdentifier: res ? res.NextRecordIdentifier : undefined
        })
        .promise();
      result.push(...res.ResourceRecordSets);
    } while (res.IsTruncated);
    return result;
  }

  /**
   * Import all records to Route53
   * @param file
   */
  static async import(file: string, importEntriesOnly: boolean) {
    let data = JSONUtils.loadFile(file);
    const targetZone = await this.getZoneForDomainName(data.domain);
    const r53 = new AWS.Route53();
    if (!targetZone) {
      throw Error("Domain is not handled on AWS");
    }
    await r53
      .changeResourceRecordSets({
        HostedZoneId: targetZone.Id,
        ChangeBatch: {
          Changes: data.entries
            .filter(r => !(r.Type === "NS" && r.Name === targetZone.Name))
            .map(r => {
              if (!r.ResourceRecords.length) {
                delete r.ResourceRecords;
              }
              return r;
            })
            .map(r => ({
              Action: "UPSERT",
              ResourceRecordSet: r
            }))
        }
      })
      .promise();
  }

  /**
   * Export all records from Route53 into a file
   *
   * @param domain to export
   * @param file to export to (can be .json or .yml)
   */
  static async export(domain: string, file: string) {
    JSONUtils.saveFile(
      {
        domain,
        entries: await Route53Service.getEntries(domain)
      },
      file
    );
  }

  /**
   * Manage the shell command
   *
   * @param Console
   * @param args
   */
  static async shell(Console, args) {
    const command = args._.shift();
    switch (command) {
      case "import":
        await this.import(args._[0], false);
        break;
      case "export":
        await this.export(args._[0], args._[1]);
        break;
    }
  }
}
