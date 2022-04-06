import { suite, test } from "@testdeck/mocha";
import { Route53Service } from "./route53";
import * as sinon from "sinon";
import * as assert from "assert";
import { JSONUtils } from "@webda/core";
import { mockClient } from "aws-sdk-client-mock";
import { ChangeResourceRecordSetsCommand, ListResourceRecordSetsCommand, Route53 } from "@aws-sdk/client-route-53";

@suite
class Route53Test {
  @test
  async exportImport() {
    // Mock
    var callSpy2 = sinon.stub().callsFake(async () => {
      if (callSpy2.callCount == 1) {
        return {
          ResourceRecordSets: JSONUtils.loadFile("./test/zone-export.json").entries,
          IsTruncated: true,
          NextRecordIdentifier: "plop"
        };
      } else {
        return {
          ResourceRecordSets: [],
          IsTruncated: false
        };
      }
    });
    var spyChanges = sinon.stub().resolves({});
    const mock = mockClient(Route53)
      .on(ListResourceRecordSetsCommand)
      .callsFake(callSpy2)
      .on(ChangeResourceRecordSetsCommand)
      .callsFake(spyChanges);
    try {
      let stub = sinon.stub(Route53Service, "getZoneForDomainName").callsFake(() => {
        return undefined;
      });
      await assert.rejects(
        () => Route53Service.createDNSEntry("test.com", "A", "1.1.1.1"),
        /Domain 'test.com.?' is not handled on AWS/
      );
      await assert.rejects(() => Route53Service.getEntries("test.com"), /Domain 'test.com.?' is not handled on AWS/);
      await assert.rejects(
        () => Route53Service.import("./test/zone-export.json", false, undefined),
        /Domain 'webda.io.?' is not handled on AWS/
      );

      stub.callsFake(async () => {
        return { Id: "myZone", Name: "webda.io.", CallerReference: "" };
      });

      await Route53Service.createDNSEntry("test.com", "A", "1.1.1.1");

      await Route53Service.shell(undefined, { _: ["export"], domain: "webda.io", file: "./myzone.json" });
      await Route53Service.shell(undefined, { _: ["import"], file: "./test/zone-export.json" });

      spyChanges.callsFake(() => {
        throw new Error("Cannot do this");
      });
      let logs;
      await Route53Service.import("./test/zone-export.json", false, {
        log: (...args) => {
          logs = args;
        }
      });
      assert.deepStrictEqual([logs[0], logs[1].toString()], ["ERROR", "Error: Cannot do this"]);
    } finally {
      mock.restore();
    }
  }
}
