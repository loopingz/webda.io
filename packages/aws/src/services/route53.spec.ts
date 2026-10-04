import {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  Route53
} from "@aws-sdk/client-route-53";
import { ServiceParameters } from "@webda/core";
import { suite, test } from "@webda/test";
import { JSONUtils } from "@webda/utils";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { existsSync, unlinkSync } from "fs";
import { vi } from "vitest";
import { AWSCommands } from "./awscommands.service.js";
import { Route53Service } from "./route53.service.js";

@suite
class Route53Test {
  @test
  async exportImport() {
    let logs;
    const log = (...args) => {
      logs = args;
    };
    const commands = new AWSCommands("AWSCommands", new ServiceParameters().load({}));
    commands.log = log;
    let listCalls = 0;
    const mock = mockClient(Route53);
    mock.on(ListResourceRecordSetsCommand).callsFake(async () => {
      if (++listCalls % 2 === 1) {
        return {
          ResourceRecordSets: JSONUtils.loadFile("./test/zone-export.json").entries,
          IsTruncated: true,
          NextRecordIdentifier: "plop"
        };
      }
      return {
        ResourceRecordSets: [
          {
            Name: "toremove",
            Type: "TXT"
          }
        ],
        IsTruncated: false
      };
    });
    mock.on(ChangeResourceRecordSetsCommand).resolves({});
    const zone = vi.spyOn(Route53Service, "getZoneForDomainName").mockResolvedValue(undefined);
    try {
      await assert.rejects(
        () => Route53Service.createDNSEntry("test.com", "A", "1.1.1.1"),
        /Domain 'test.com.?' is not handled on AWS/
      );
      await assert.rejects(() => Route53Service.getEntries("test.com"), /Domain 'test.com.?' is not handled on AWS/);
      await assert.rejects(
        () => Route53Service.import({ file: "./test/zone-export.json" }),
        /Domain 'webda.io.?' is not handled on AWS/
      );

      zone.mockResolvedValue({ Id: "myZone", Name: "webda.io.", CallerReference: "" });

      await Route53Service.createDNSEntry("test.com", "A", "1.1.1.1");
      assert.strictEqual(Route53Service.completeDomain("test.com."), "test.com.");

      await commands.route53Export("webda.io", "./myzone.json");
      assert.strictEqual(JSONUtils.loadFile("./myzone.json").domain, "webda.io");
      await commands.route53Import("./test/zone-export.json");
      await commands.route53Sync("./test/zone-export.json", true);
      assert.deepStrictEqual(logs, ["INFO", "Deleting entry\n", '{\n  "Name": "toremove",\n  "Type": "TXT"\n}']);
      await commands.route53Sync("./test/zone-export.json");
      assert.deepStrictEqual(logs, ["INFO", "Deleting 1 records"]);
      mock.on(ChangeResourceRecordSetsCommand).rejects(new Error("Cannot do this"));
      await Route53Service.import({ file: "./test/zone-export.json" }, log);
      assert.deepStrictEqual([logs[0], logs[1].toString()], ["ERROR", "Error: Cannot do this"]);
    } finally {
      if (existsSync("./myzone.json")) {
        unlinkSync("./myzone.json");
      }
      zone.mockRestore();
      mock.restore();
    }
  }

  @test
  async getZoneForDomainName() {
    const mock = mockClient(Route53);
    try {
      let call = 0;
      mock.on(ListHostedZonesCommand).callsFake(async () => {
        if (call++ === 0) {
          return {
            HostedZones: [
              { Id: "1", Name: "io.", CallerReference: "" },
              { Id: "2", Name: "webda.io.", CallerReference: "" }
            ],
            NextMarker: "next"
          };
        }
        return { HostedZones: [{ Id: "3", Name: "other.com.", CallerReference: "" }] };
      });
      assert.strictEqual((await Route53Service.getZoneForDomainName("test.webda.io")).Id, "2");
      call = 0;
      assert.strictEqual(await Route53Service.getZoneForDomainName("test.unknown.net"), undefined);
    } finally {
      mock.restore();
    }
  }
}
