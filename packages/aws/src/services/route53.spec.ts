import { ChangeResourceRecordSetsCommand, ListResourceRecordSetsCommand, Route53 } from "@aws-sdk/client-route-53";
import { suite, test } from "@webda/test";
import { JSONUtils } from "@webda/utils";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import * as sinon from "sinon";
import { Route53Service } from "./route53";
import { existsSync, unlinkSync } from "fs";

@suite
class Route53Test {
  @test
  async exportImport() {
    let logs;
    const Console = {
      log: (...args) => {
        console.log(...args);
        logs = args;
      }
    };
    // Mock
    const callSpy2 = sinon.stub().callsFake(async () => {
      if (callSpy2.callCount == 1) {
        return {
          ResourceRecordSets: JSONUtils.loadFile("./test/zone-export.json").entries,
          IsTruncated: true,
          NextRecordIdentifier: "plop"
        };
      } else {
        return {
          ResourceRecordSets: [
            {
              Name: "toremove",
              Type: "TXT"
            }
          ],
          IsTruncated: false
        };
      }
    });
    const spyChanges = sinon.stub().resolves({});
    const mock = mockClient(Route53)
      .on(ListResourceRecordSetsCommand)
      .callsFake(callSpy2)
      .on(ChangeResourceRecordSetsCommand)
      .callsFake(spyChanges);
    try {
      const stub = sinon.stub(Route53Service, "getZoneForDomainName").callsFake(() => {
        return undefined;
      });
      await assert.rejects(
        () => Route53Service.createDNSEntry("test.com", "A", "1.1.1.1"),
        /Domain 'test.com.?' is not handled on AWS/
      );
      await assert.rejects(() => Route53Service.getEntries("test.com"), /Domain 'test.com.?' is not handled on AWS/);
      await assert.rejects(
        () => Route53Service.import({ file: "./test/zone-export.json" }, undefined),
        /Domain 'webda.io.?' is not handled on AWS/
      );

      stub.callsFake(async () => {
        return { Id: "myZone", Name: "webda.io.", CallerReference: "" };
      });

      await Route53Service.createDNSEntry("test.com", "A", "1.1.1.1");

      await Route53Service.shell(undefined, {
        _: ["export"],
        domain: "webda.io",
        file: "./myzone.json"
      });
      await Route53Service.shell(undefined, {
        _: ["import"],
        file: "./test/zone-export.json"
      });
      await Route53Service.shell(Console, {
        _: ["sync"],
        file: "./test/zone-export.json",
        pretend: true
      });
      assert.deepStrictEqual(logs, ["INFO", "Deleting entry\n", '{\n  "Name": "toremove",\n  "Type": "TXT"\n}']);
      await Route53Service.shell(Console, {
        _: ["sync"],
        file: "./test/zone-export.json"
      });
      assert.deepStrictEqual(logs, ["INFO", "Deleting 1 records"]);
      spyChanges.callsFake(() => {
        throw new Error("Cannot do this");
      });
      await Route53Service.import(
        { file: "./test/zone-export.json" },
        {
          log: (...args) => {
            logs = args;
          }
        }
      );
      assert.deepStrictEqual([logs[0], logs[1].toString()], ["ERROR", "Error: Cannot do this"]);
    } finally {
      existsSync("./myzone.json") && unlinkSync("./myzone.json");
      mock.restore();
    }
  }
}
