import { HostedZone, ListHostedZonesRequest, ListHostedZonesResponse, ListResourceRecordSetsResponse, Route53 } from "@aws-sdk/client-route-53";
import { Service, Cache, JSONUtils } from "@webda/core";
import { PromiseResult } from "aws-sdk/lib/request";

export class Route53Service extends Service {
  /**
   * Get the closest zone to the domain
   *
   * @param domain to get zone for
   */
  @Cache()
  static async getZoneForDomainName(domain): Promise<HostedZone> {
    domain = this.completeDomain(domain);
    let targetZone: HostedZone;
    // Find the right zone
    let r53: Route53 = new Route53({});
    let res: ListHostedZonesResponse;
    let params: ListHostedZonesRequest = {};
    // Identify the right zone first
    do {
      res = await r53.listHostedZones(params);
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

  static completeDomain(domain: string) {
    if (!domain.endsWith(".")) {
      domain = domain + ".";
    }
    return domain;
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
    targetZone: HostedZone = undefined,
    Comment: string = "@webda/aws-created"
  ): Promise<void> {
    let r53 = new Route53({});
    domain = this.completeDomain(domain);
    if (!targetZone) {
      targetZone = await this.getZoneForDomainName(domain);
    }
    if (!targetZone) {
      throw Error(`Domain '${domain}' is not handled on AWS`);
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
      });
  }

  /**
   * Return all entries of a zone in AWS
   *
   * @param domain to retrieve from
   */
  static async getEntries(domain: string) {
    let r53 = new Route53({});
    const zone = await Route53Service.getZoneForDomainName(domain);
    if (!zone) {
      throw new Error(`Domain '${domain}' is not handled on AWS`);
    }
    const result = [];
    let res;
    do {
      res = await r53
        .listResourceRecordSets({
          HostedZoneId: zone.Id,
          StartRecordIdentifier: res ? res.NextRecordIdentifier : undefined
        });
      result.push(...res.ResourceRecordSets);
    } while (res.IsTruncated);
    return result;
  }

  /**
   * Import all records to Route53
   * @param file
   */
  static async import(file: string, importEntriesOnly: boolean, Console) {
    let data = JSONUtils.loadFile(file);
    const targetZone = await this.getZoneForDomainName(data.domain);
    const r53 = new Route53({});
    if (!targetZone) {
      throw Error(`Domain '${data.domain}' is not handled on AWS`);
    }
    try {
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
        });
    } catch (err) {
      Console.log("ERROR", err);
    }
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
        await this.import(args.file, false, Console);
        break;
      case "export":
        await this.export(args.domain, args.file);
        break;
    }
  }
}
