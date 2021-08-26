import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import * as assert from "assert";
import * as AWS from "aws-sdk";
import * as AWSMock from "aws-sdk-mock";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { AWSDeployer, AWSDeployerResources } from ".";
import { CacheService } from "@webda/core";
class TestAWSDeployer extends AWSDeployer<AWSDeployerResources> {
  async deploy(): Promise<any> {}

  async restrictedCall(method: string, ...args) {
    return this[method](...args);
  }
}

export interface Mockable {
  mocks: { [key: string]: sinon.stub };
}

export function MockAWSDeployerMethods(service: AWSDeployer<any>, test: Mockable) {
  test.mocks["putFilesOnBucket"] = sinon.stub(service, "putFilesOnBucket").callsFake(async () => {});
  test.mocks["createBucket"] = sinon.stub(service, "createBucket").callsFake(async () => {});
  test.mocks["doCreateCertificate"] = sinon.stub(service, "doCreateCertificate").callsFake(async () => {});
  test.mocks["getCertificate"] = sinon.stub(service, "getCertificate").callsFake(async () => "arn:myfakecertif");
  test.mocks["createDNSEntry"] = sinon.stub(service, "createDNSEntry").callsFake(async () => {});
  test.mocks["getZoneForDomainName"] = sinon
    .stub(service, "getZoneForDomainName")
    .callsFake(async () => ({ Id: "MyZoneId" }));
  test.mocks["getAWSIdentity"] = sinon.stub(service, "getAWSIdentity").callsFake(async () => ({
    Account: "666111333",
    UserId: "AR1232432433",
    Arn: "arn:aws:sts::666111333:assumed-role"
  }));
  test.mocks["getDefaultVpc"] = sinon.stub(service, "getDefaultVpc").callsFake(async () => ({
    Id: "vpc-666",
    Subnets: [{ SubnetId: "subnet-1" }, { SubnetId: "subnet-2" }, { SubnetId: "subnet-2" }]
  }));
  test.mocks["getPolicyDocument"] = sinon.stub(service, "getPolicyDocument").callsFake(async () => ({
    Version: "2012-10-17",
    Statement: []
  }));
}

@suite
class AWSDeployerTest extends DeployerTest<TestAWSDeployer> {
  async getDeployer(manager: DeploymentManager) {
    return new TestAWSDeployer(manager, {});
  }

  async before() {
    await super.before();
    AWSMock.setSDKInstance(AWS);
  }

  @test
  mapToArrayTags() {
    let deployer = new TestAWSDeployer(this.manager, { Tags: { Test: "Plop" } });
    assert.deepStrictEqual(deployer.resources.Tags, [{ Key: "Test", Value: "Plop" }]);
    assert.deepStrictEqual(deployer.transformMapTagsToArray([{ Key: "Test", Value: "Plop" }]), [
      { Key: "Test", Value: "Plop" }
    ]);
  }

  @test
  async putFilesOnBucket() {
    try {
      await this.deployer.putFilesOnBucket("plop", []);
      await assert.rejects(
        // @ts-ignore
        () => this.deployer.putFilesOnBucket("plop", [{ key: "/test" }]),
        /Should have src and key defined/
      );
      let Contents = [{ Key: "awsevents.js", Size: 587, ETag: '"312d05552187d3fdfdda3860fbeef48f"' }];
      let stub = sinon.stub().callsFake((p, c) => {
        return c(null, {
          Contents
        });
      });
      AWSMock.mock("S3", "listObjectsV2", stub);
      // Fake any uploads
      let uploads = [];
      AWSMock.mock("S3", "putObject", (p, c) => {
        uploads.push(p);
        c(null, {});
      });
      sinon.stub(this.deployer, "createBucket").callsFake(() => {});
      await this.deployer.putFolderOnBucket("plop", "./test/moddas");
      assert.strictEqual(uploads.length, 0);
      Contents[0].ETag = "plop";
      await this.deployer.putFolderOnBucket("plop", "./test/moddas");
      assert.strictEqual(uploads.length, 1);
      uploads = [];
      Contents[0].ETag = '"312d05552187d3fdfdda3860fbeef48f"';
      Contents[0].Size = 123;
      await this.deployer.putFolderOnBucket("plop", "./test/moddas");
      assert.strictEqual(uploads.length, 1);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testGetPolicyDocument() {
    try {
      AWSMock.mock("STS", "getCallerIdentity", callback => {
        callback(null, {
          Account: "test"
        });
      });
      // @ts-ignore
      this.manager.getWebda().getServices()["customservice"].getARNPolicy = () => {
        return [
          { Sid: "", Effect: "Allow", Action: [], Resource: "*" },
          { Sid: "", Effect: "Allow", Action: [], Resource: "*" }
        ];
      };
      let result = await this.deployer.getPolicyDocument();
      assert.strictEqual(result.Statement.length, 4);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testGetDefaultVpc() {
    try {
      var vpcsSpy = sinon.stub().callsFake(c => {
        if (vpcsSpy.callCount === 1) {
          c(null, {
            Vpcs: []
          });
          return;
        }
        c(null, {
          Vpcs: [
            {
              VpcId: "vpc-667",
              IsDefault: false
            },
            {
              VpcId: "vpc-666",
              IsDefault: true
            }
          ]
        });
      });
      var subnetsSpy = sinon.stub().callsFake((p, c) => {
        c(null, {
          Subnets: [
            {
              SubnetId: "subnet-1"
            },
            {
              SubnetId: "subnet-2"
            }
          ]
        });
      });
      AWSMock.mock("EC2", "describeVpcs", vpcsSpy);
      AWSMock.mock("EC2", "describeSubnets", subnetsSpy);
      let result = await this.deployer.getDefaultVpc();
      assert.strictEqual(vpcsSpy.calledOnce, true);
      assert.strictEqual(subnetsSpy.notCalled, true);
      assert.strictEqual(result, undefined);

      CacheService.clearAllCache();
      result = await this.deployer.getDefaultVpc();
      assert.deepStrictEqual(result, {
        Id: "vpc-666",
        Subnets: [{ SubnetId: "subnet-1" }, { SubnetId: "subnet-2" }]
      });
      assert.strictEqual(
        subnetsSpy.calledWith({
          Filters: [
            {
              Name: "vpc-id",
              Values: ["vpc-666"]
            }
          ]
        }),
        true
      );
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testCommonPrefix() {
    assert.strictEqual(this.deployer.commonPrefix("/test/bouzf", "/test/reffff"), "/test/");
    assert.strictEqual(this.deployer.commonPrefix("test/bouzf", "/test/reffff"), "");
    assert.strictEqual(this.deployer.commonPrefix("/tes", "/test/reffff"), "/tes");
  }

  @test
  async testCreateBucket() {
    try {
      this.deployer.resources.Tags = this.deployer.transformMapTagsToArray({ test: "mytag" });
      var headSpy = sinon.stub();
      headSpy.callsFake((params, callback) => {
        let res = {};
        switch (headSpy.callCount) {
          case 2:
            callback({
              code: "Forbidden"
            });
            return;
          case 3:
            callback({
              code: "NotFound"
            });
            return;
        }
        callback(null, res);
      });
      var createSpy = sinon.stub().callsFake((params, callback) => callback());
      var tagSpy = sinon.stub().callsFake((params, callback) => callback());
      AWSMock.mock("S3", "headBucket", headSpy);
      AWSMock.mock("S3", "createBucket", createSpy);
      AWSMock.mock("S3", "putBucketTagging", tagSpy);
      await this.deployer.createBucket("plop");
      // Bucket exists
      assert.strictEqual(headSpy.callCount, 1);
      assert.strictEqual(headSpy.calledWith({ Bucket: "plop" }), true);
      assert.strictEqual(createSpy.notCalled, true);
      assert.strictEqual(tagSpy.notCalled, true);
      // Bucket exists in another account or we do not have rights
      await this.deployer.createBucket("plop");
      assert.strictEqual(headSpy.callCount, 2);
      assert.strictEqual(createSpy.notCalled, true);
      await this.deployer.createBucket("plop");
      assert.strictEqual(headSpy.callCount, 3);
      assert.strictEqual(createSpy.calledOnce, true);
      assert.strictEqual(createSpy.calledWith({ Bucket: "plop" }), true);
      assert.strictEqual(tagSpy.calledOnce, true);
      assert.strictEqual(
        tagSpy.calledWith({ Bucket: "plop", Tagging: { TagSet: [{ Key: "test", Value: "mytag" }] } }),
        true
      );
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testPutBucket() {
    try {
      var putSpy = sinon.stub();
      var listSpy = sinon.stub();
      var createBucket = sinon.stub(this.deployer, "createBucket");
      createBucket.callsFake(async () => {});
      putSpy.callsFake((p, c) => c());
      listSpy.callsFake((p, c) => c(null, { Contents: [] }));
      AWSMock.mock("S3", "putObject", putSpy);
      AWSMock.mock("S3", "listObjectsV2", listSpy);
      // @ts-ignore shortcut to test both in one
      await this.deployer.putFilesOnBucket("plop", [
        { src: __filename },
        { src: __dirname + "/index.ts", key: "plop.ts" },
        { key: "buffer.out", src: Buffer.from("bouzouf"), mimetype: "text/plain" }
      ]);
      assert.strictEqual(putSpy.callCount, 3);
      // checks call
      assert.strictEqual(putSpy.firstCall.firstArg.Body.constructor.name, "ReadStream");
      assert.strictEqual(putSpy.secondCall.firstArg.Body.constructor.name, "ReadStream");
      assert.deepStrictEqual(putSpy.thirdCall.firstArg.Body.constructor.name, "Buffer");
      assert.deepStrictEqual(putSpy.thirdCall.firstArg.Body.toString(), "bouzouf");
      assert.strictEqual(createBucket.calledOnce, true);
      // TODO Check upload optimization
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testGetCertificate() {
    try {
      var putSpy = sinon.stub();
      var getZoneForDomainName = sinon.stub(this.deployer, "getZoneForDomainName");
      var doCreateCertificate = sinon.stub(this.deployer, "doCreateCertificate");
      getZoneForDomainName.callsFake(async () => {
        if (getZoneForDomainName.callCount === 1) {
          return undefined;
        }
        return { Id: "1234" };
      });
      doCreateCertificate.callsFake(() => ({ DomainName: "newlyCreated" }));
      putSpy.callsFake((p, c) => {
        switch (putSpy.callCount) {
          case 1:
            return c(null, {
              CertificateSummaryList: [
                {
                  DomainName: "none.com"
                }
              ],
              NextToken: "page2"
            });
          case 2:
            return c(null, {
              CertificateSummaryList: [
                {
                  DomainName: "test.webda.io"
                }
              ]
            });
          default:
            return c(null, { CertificateSummaryList: [] });
        }
        c();
      });
      AWSMock.mock("ACM", "listCertificates", putSpy);
      let certificate = await this.deployer.getCertificate("test.webda.io.");
      assert.strictEqual(putSpy.calledTwice, true);
      assert.strictEqual(doCreateCertificate.notCalled, true);
      assert.strictEqual(getZoneForDomainName.notCalled, true);
      assert.deepStrictEqual(certificate, { DomainName: "test.webda.io" });
      await assert.rejects(
        async () => await this.deployer.getCertificate("test.webda.io"),
        /Cannot create certificate as Route53 Zone was not found/g
      );
      assert.strictEqual(getZoneForDomainName.calledWith("test.webda.io"), true);
      assert.strictEqual(doCreateCertificate.notCalled, true);
      await this.deployer.getCertificate("test.webda.io", "us-east-1");
      assert.strictEqual(doCreateCertificate.calledWith("test.webda.io", { Id: "1234" }), true);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testGetZoneForDomainName() {
    try {
      var callSpy = sinon.stub();
      callSpy.callsFake((p, c) => {
        switch (callSpy.callCount) {
          case 1:
            return c(null, { HostedZones: [], NextMarker: "plop" });
          default:
            return c(null, {
              HostedZones: [
                { Name: "webda.io." },
                { Name: "bouzouf.io." },
                { Name: "test2.test.webda.io." },
                { Name: "test.webda.io." }
              ]
            });
        }
      });
      AWSMock.mock("Route53", "listHostedZones", callSpy);
      let result = await this.deployer.getZoneForDomainName("subdomain.test2.test.webda.io.");
      assert.deepStrictEqual(result, {
        Name: "test2.test.webda.io."
      });
      assert.strictEqual(callSpy.calledTwice, true);
      result = await this.deployer.getZoneForDomainName("subdomain.webda.io");
      assert.deepStrictEqual(result, {
        Name: "webda.io."
      });
      result = await this.deployer.getZoneForDomainName("loopingz.com.");
      assert.strictEqual(result, undefined);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testDoCreateCertificate() {
    try {
      var requestCertificate = sinon.stub();
      var describeCertificate = sinon.stub();
      var createDNSEntry = sinon.stub(this.deployer, "createDNSEntry");
      var waitFor = sinon.stub(this.deployer, "waitFor");
      createDNSEntry.callsFake(async () => {});
      describeCertificate.callsFake((p, c) => {});
      AWSMock.mock("ACM", "requestCertificate", requestCertificate);
      AWSMock.mock("ACM", "describeCertificate", describeCertificate);
      waitFor.callsFake(async callback => {
        switch (waitFor.callCount) {
          case 1:
            await callback();
          case 2:
            return new Promise(resolve => callback(resolve));
        }
      });
      describeCertificate.callsFake((p, c) => {
        if (describeCertificate.callCount === 1) {
          return c(null, {
            Certificate: {
              DomainValidationOptions: [{}]
            }
          });
        } else {
          return c(null, {
            Certificate: {
              Status: "FAILED",
              DomainValidationOptions: [{ ResourceRecord: "bouzouf" }]
            }
          });
        }
      });
      requestCertificate.callsFake((p, c) => {
        c(null, { CertificateArn: "plop" });
      });
      await assert.rejects(
        async () => await this.deployer.doCreateCertificate("test.webda.io.", <any>{ Id: "1234" }),
        /Certificate validation has failed/g
      );
      waitFor.callsFake(() => undefined);
      await assert.rejects(
        async () => await this.deployer.doCreateCertificate("test.webda.io.", <any>{ Id: "1234" }),
        /Certificate validation has failed/g
      );
      waitFor.resetHistory();
      describeCertificate.resetHistory();
      assert.strictEqual(createDNSEntry.notCalled, true);
      waitFor.callsFake(c => {
        switch (waitFor.callCount) {
          case 1:
            return {
              Status: "PENDING_VALIDATION",
              DomainValidationOptions: [{ ResourceRecord: { Value: "plop.com.", Name: "bouzouf.com" } }],
              CertificateArn: "arn:plop"
            };
          default:
            return new Promise(async (resolve, reject) => {
              for (let i = 0; i < 5; i++) {
                if (await c(resolve, reject)) {
                  return;
                }
              }
              reject("max");
            });
        }
      });
      describeCertificate.callsFake((p, c) => {
        if (describeCertificate.callCount < 3) {
          return c(null, {
            Certificate: {
              Status: "PENDING_VALIDATION"
            }
          });
        } else {
          return c(null, {
            Certificate: {
              Status: "ISSUED"
            }
          });
        }
      });
      await this.deployer.doCreateCertificate("test.webda.io.", <any>{ Id: "1234" });
      assert.strictEqual(createDNSEntry.calledWith("bouzouf.com", "CNAME", "plop.com.", { Id: "1234" }), true);
      assert.strictEqual(describeCertificate.callCount, 3);
      waitFor.resetHistory();
      describeCertificate.callsFake((p, c) => c(null, { Certificate: { Status: "ERROR" } }));
      let exception = false;
      try {
        // Should be able to use assert.rejects
        await this.deployer.doCreateCertificate("test.webda.io.", <any>{ Id: "1234" });
      } catch (err) {
        assert.deepStrictEqual(err, { Status: "ERROR" });
        exception = true;
      }
      assert.strictEqual(exception, true);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testCreateDNSEntry() {
    try {
      var callSpy = sinon.stub();
      var getZoneForDomainName = sinon.stub(this.deployer, "getZoneForDomainName");
      getZoneForDomainName.callsFake(async () => {
        if (getZoneForDomainName.callCount === 1) {
          return undefined;
        }
        return { Id: "1234" };
      });
      callSpy.callsFake((p, c) => c());
      AWSMock.mock("Route53", "changeResourceRecordSets", callSpy);
      await assert.rejects(
        async () => await this.deployer.restrictedCall("createDNSEntry", "webda.io", "CNAME", "loopingz.com"),
        /Domain is not handled on AWS/g
      );
      assert.strictEqual(callSpy.notCalled, true);
      await this.deployer.restrictedCall("createDNSEntry", "webda.io.", "CNAME", "loopingz.com");
      assert.strictEqual(callSpy.calledOnce, true);
      assert.deepStrictEqual(callSpy.firstCall.firstArg, {
        HostedZoneId: "1234",
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: "webda.io.",
                ResourceRecords: [
                  {
                    Value: "loopingz.com"
                  }
                ],
                TTL: 360,
                Type: "CNAME"
              }
            }
          ],
          Comment: "webda-automated-deploiement"
        }
      });
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testHash() {
    assert.strictEqual(await this.deployer.restrictedCall("md5", "bouzouf"), "fc45f69f910da129848cd265448a5d00");
    assert.strictEqual(await this.deployer.restrictedCall("hash", "bouzouf"), "fc45f69f910da129848cd265448a5d00");
    assert.strictEqual(
      await this.deployer.restrictedCall("hash", "bouzouf", "md5", "base64"),
      "/EX2n5ENoSmEjNJlRIpdAA=="
    );
    assert.strictEqual(
      await this.deployer.restrictedCall("hash", "bouzouf", "sha256", "hex"),
      "fc45f69f910da129848cd265448a5d00"
    );
  }

  @test
  async cov() {
    assert.strictEqual(this.deployer.getRegion(), "us-east-1");
    this.deployer.waitFor(
      async resolve => {
        resolve();
        return true;
      },
      1,
      "test",
      1
    );
    this.deployer.resources.Tags = [{ Key: "plop", Value: "test" }];
    // @ts-ignore
    this.deployer.resources.Plop = { Tags: { plop2: "oké yep" } };
    assert.strictEqual(this.deployer.getDefaultTagsAsS3Tagging("Plop"), "plop2=ok%C3%A9%20yep&plop=test");
  }

  @test
  replaceForAWS() {
    assert.strictEqual(this.deployer._replaceForAWS("my/id"), "my_id");
    assert.strictEqual(this.deployer._replaceForAWS("myid"), "myid");
  }

  @test
  transformArrayTagsToMap() {
    assert.deepStrictEqual(this.deployer.transformArrayTagsToMap([{ Key: "Test", Value: "plop" }]), { Test: "plop" });
    assert.deepStrictEqual(this.deployer.transformArrayTagsToMap({ Test: "plop" }), { Test: "plop" });
    assert.deepStrictEqual(this.deployer.getDefaultTagsAsMap(), {});
    assert.deepStrictEqual(this.deployer.getDefaultTags("me"), []);
  }
}
