import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import * as assert from "assert";
import * as AWS from "aws-sdk";
import * as AWSMock from "aws-sdk-mock";
import { suite, test } from "mocha-typescript";
import * as sinon from "sinon";
import { MethodCacheService } from "ts-method-cache";
import { AWSDeployer, AWSDeployerResources } from ".";

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
  async testGetPolicyDocument() {
    try {
      AWSMock.mock("STS", "getCallerIdentity", callback => {
        callback(null, {
          Account: "test"
        });
      });
      let result = await this.deployer.getPolicyDocument();
      console.log(result.Statement);
      assert.equal(result.Statement.length, 4);
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
      assert.equal(vpcsSpy.calledOnce, true);
      assert.equal(subnetsSpy.notCalled, true);
      assert.equal(result, undefined);

      new MethodCacheService().clearAllCache();
      result = await this.deployer.getDefaultVpc();
      assert.deepEqual(result, {
        Id: "vpc-666",
        Subnets: [{ SubnetId: "subnet-1" }, { SubnetId: "subnet-2" }]
      });
      assert.equal(
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
    assert.equal(this.deployer.commonPrefix("/test/bouzf", "/test/reffff"), "/test/");
    assert.equal(this.deployer.commonPrefix("test/bouzf", "/test/reffff"), "");
    assert.equal(this.deployer.commonPrefix("/tes", "/test/reffff"), "/tes");
  }

  @test
  async testCreateBucket() {
    try {
      this.deployer.resources.Tags = this.deployer.transformTags({ test: "mytag" });
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
      assert.equal(headSpy.callCount, 1);
      assert.equal(headSpy.calledWith({ Bucket: "plop" }), true);
      assert.equal(createSpy.notCalled, true);
      assert.equal(tagSpy.notCalled, true);
      // Bucket exists in another account or we do not have rights
      await this.deployer.createBucket("plop");
      assert.equal(headSpy.callCount, 2);
      assert.equal(createSpy.notCalled, true);
      await this.deployer.createBucket("plop");
      assert.equal(headSpy.callCount, 3);
      assert.equal(createSpy.calledOnce, true);
      assert.equal(createSpy.calledWith({ Bucket: "plop" }), true);
      assert.equal(tagSpy.calledOnce, true);
      assert.equal(tagSpy.calledWith({ Bucket: "plop", Tagging: { TagSet: [{ Key: "test", Value: "mytag" }] } }), true);
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
      assert.equal(putSpy.callCount, 3);
      // checks call
      assert.equal(putSpy.firstCall.firstArg.Body.constructor.name, "ReadStream");
      assert.equal(putSpy.secondCall.firstArg.Body.constructor.name, "ReadStream");
      assert.deepEqual(putSpy.thirdCall.firstArg.Body.constructor.name, "Buffer");
      assert.deepEqual(putSpy.thirdCall.firstArg.Body.toString(), "bouzouf");
      assert.equal(createBucket.calledOnce, true);
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
      assert.equal(putSpy.calledTwice, true);
      assert.equal(doCreateCertificate.notCalled, true);
      assert.equal(getZoneForDomainName.notCalled, true);
      assert.deepEqual(certificate, { DomainName: "test.webda.io" });
      await assert.rejects(
        async () => await this.deployer.getCertificate("test.webda.io"),
        /Cannot create certificate as Route53 Zone was not found/g
      );
      assert.equal(getZoneForDomainName.calledWith("test.webda.io"), true);
      assert.equal(doCreateCertificate.notCalled, true);
      await this.deployer.getCertificate("test.webda.io", "us-east-1");
      assert.equal(doCreateCertificate.calledWith("test.webda.io", { Id: "1234" }), true);
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
      assert.deepEqual(result, {
        Name: "test2.test.webda.io."
      });
      assert.equal(callSpy.calledTwice, true);
      result = await this.deployer.getZoneForDomainName("subdomain.webda.io");
      assert.deepEqual(result, {
        Name: "webda.io."
      });
      result = await this.deployer.getZoneForDomainName("loopingz.com.");
      assert.equal(result, undefined);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testWaitFor() {
    let consoleSpy = sinon.stub(this.deployer.logger, "log");
    try {
      await assert.rejects(
        async () => await this.deployer.waitFor(() => {}, 1, 3, "title"),
        /Timeout while waiting for title/g
      );
      assert.equal(consoleSpy.callCount, 3);
      assert.equal(consoleSpy.calledWith("DEBUG", "[1/3]", "title"), true);
      assert.equal(consoleSpy.calledWith("DEBUG", "[2/3]", "title"), true);
      assert.equal(consoleSpy.calledWith("DEBUG", "[3/3]", "title"), true);
      consoleSpy.resetHistory();
      let res = await this.deployer.waitFor(
        (resolve, reject) => {
          if (consoleSpy.callCount === 2) {
            resolve({ myobject: "test" });
            return true;
          }
        },
        1,
        3,
        "title"
      );
      assert.equal(consoleSpy.callCount, 2);
      assert.equal(consoleSpy.calledWith("DEBUG", "[1/3]", "title"), true);
      assert.equal(consoleSpy.calledWith("DEBUG", "[2/3]", "title"), true);
      assert.equal(consoleSpy.calledWith("DEBUG", "[3/3]", "title"), false);
      assert.deepEqual(res, { myobject: "test" });
    } finally {
      consoleSpy.restore();
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
      assert.equal(createDNSEntry.notCalled, true);
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
      assert.equal(createDNSEntry.calledWith("bouzouf.com", "CNAME", "plop.com.", { Id: "1234" }), true);
      assert.equal(describeCertificate.callCount, 3);
      waitFor.resetHistory();
      describeCertificate.callsFake((p, c) => c(null, { Certificate: { Status: "ERROR" } }));
      let exception = false;
      try {
        // Should be able to use assert.rejects
        await this.deployer.doCreateCertificate("test.webda.io.", <any>{ Id: "1234" });
      } catch (err) {
        assert.deepEqual(err, { Status: "ERROR" });
        exception = true;
      }
      assert.equal(exception, true);
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
      assert.equal(callSpy.notCalled, true);
      await this.deployer.restrictedCall("createDNSEntry", "webda.io.", "CNAME", "loopingz.com");
      assert.equal(callSpy.calledOnce, true);
      assert.deepEqual(callSpy.firstCall.firstArg, {
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
    assert.equal(await this.deployer.restrictedCall("md5", "bouzouf"), "fc45f69f910da129848cd265448a5d00");
    assert.equal(await this.deployer.restrictedCall("hash", "bouzouf"), "fc45f69f910da129848cd265448a5d00");
    assert.equal(await this.deployer.restrictedCall("hash", "bouzouf", "md5", "base64"), "/EX2n5ENoSmEjNJlRIpdAA==");
    assert.equal(
      await this.deployer.restrictedCall("hash", "bouzouf", "sha256", "hex"),
      "fc45f69f910da129848cd265448a5d00"
    );
  }
}
