import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployertest";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { AWSDeployer, AWSDeployerResources } from ".";
import { CacheService } from "@webda/core";
import { mockClient } from "aws-sdk-client-mock";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketTaggingCommand,
  PutObjectCommand,
  S3,
  NotFound
} from "@aws-sdk/client-s3";
import { DescribeSubnetsCommand, DescribeVpcsCommand, EC2 } from "@aws-sdk/client-ec2";
import {
  ACM,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand
} from "@aws-sdk/client-acm";
import { GetCallerIdentityCommand, STS } from "@aws-sdk/client-sts";
import { ChangeResourceRecordSetsCommand, HostedZone, ListHostedZonesCommand, Route53 } from "@aws-sdk/client-route-53";
class TestAWSDeployer extends AWSDeployer<AWSDeployerResources> {
  async deploy(): Promise<any> {}

  async restrictedCall(method: string, ...args) {
    return this[method](...args);
  }
}

export interface Mockable {
  mocks: { [key: string]: sinon.SinonStub };
}

export function MockAWSDeployerMethods(service: AWSDeployer<any>, test: Mockable) {
  test.mocks["putFilesOnBucket"] = sinon.stub(service, "putFilesOnBucket").resolves();
  test.mocks["createBucket"] = sinon.stub(service, "createBucket").resolves();
  test.mocks["doCreateCertificate"] = sinon.stub(service, "doCreateCertificate").resolves({});
  test.mocks["getCertificate"] = sinon.stub(service, "getCertificate").resolves("arn:myfakecertif");
  test.mocks["createDNSEntry"] = sinon.stub(service, "createDNSEntry").resolves();
  test.mocks["getZoneForDomainName"] = sinon
    .stub(service, "getZoneForDomainName")
    .resolves({ Id: "MyZoneId", Name: "", CallerReference: "" });
  test.mocks["getAWSIdentity"] = sinon.stub(service, "getAWSIdentity").resolves({
    Account: "666111333",
    UserId: "AR1232432433",
    Arn: "arn:aws:sts::666111333:assumed-role"
  });
  test.mocks["getDefaultVpc"] = sinon.stub(service, "getDefaultVpc").resolves({
    Id: "vpc-666",
    Subnets: [{ SubnetId: "subnet-1" }, { SubnetId: "subnet-2" }, { SubnetId: "subnet-2" }]
  });
  test.mocks["getPolicyDocument"] = sinon.stub(service, "getPolicyDocument").resolves({
    Version: "2012-10-17",
    Statement: []
  });
}

@suite
class AWSDeployerTest extends DeployerTest<TestAWSDeployer> {
  async getDeployer(manager: DeploymentManager) {
    return new TestAWSDeployer(manager, {});
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
    await this.deployer.putFilesOnBucket("plop", []);
    await assert.rejects(
      // @ts-ignore
      () => this.deployer.putFilesOnBucket("plop", [{ key: "/test" }]),
      /Should have src and key defined/
    );
    let Contents = [{ Key: "awsevents.js", Size: 587, ETag: '"312d05552187d3fdfdda3860fbeef48f"' }];
    let stub = sinon.stub().resolves({ Contents });
    // Fake any uploads
    let uploads = [];
    mockClient(S3)
      .on(ListObjectsV2Command)
      .callsFake(stub)
      .on(PutObjectCommand)
      .callsFake(arg => {
        uploads.push(arg);
        return {};
      });
    sinon.stub(this.deployer, "createBucket").resolves();
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
  }

  @test
  async testGetPolicyDocument() {
    const mock = mockClient(STS).on(GetCallerIdentityCommand).resolves({
      Account: "test"
    });
    try {
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
      mock.restore();
    }
  }

  @test
  async testGetDefaultVpc() {
    var vpcsSpy = sinon.stub().callsFake(async () => {
      if (vpcsSpy.callCount === 1) {
        return {
          Vpcs: []
        };
      }
      return {
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
      };
    });
    var subnetsSpy = sinon.stub().callsFake(async () => {
      return {
        Subnets: [
          {
            SubnetId: "subnet-1"
          },
          {
            SubnetId: "subnet-2"
          }
        ]
      };
    });
    const mock = mockClient(EC2)
      .on(DescribeVpcsCommand)
      .callsFake(vpcsSpy)
      .on(DescribeSubnetsCommand)
      .callsFake(subnetsSpy);
    try {
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
      mock.restore();
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
    this.deployer.resources.Tags = this.deployer.transformMapTagsToArray({ test: "mytag" });
    var headSpy = sinon.stub();
    headSpy.callsFake(async () => {
      let res = {};
      switch (headSpy.callCount) {
        case 2:
          throw {
            name: "Forbidden"
          };
        case 3:
          throw new NotFound({
            $metadata: {}
          });
      }
      return res;
    });
    var createSpy = sinon.stub().resolves();
    var tagSpy = sinon.stub().resolves();
    const mock = mockClient(S3)
      .on(HeadBucketCommand)
      .callsFake(headSpy)
      .on(CreateBucketCommand)
      .callsFake(createSpy)
      .on(PutBucketTaggingCommand)
      .callsFake(tagSpy);
    try {
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
      mock.restore();
    }
  }

  @test
  async testPutBucket() {
    var putSpy = sinon.stub();
    var listSpy = sinon.stub();
    var createBucket = sinon.stub(this.deployer, "createBucket");
    createBucket.resolves();
    putSpy.resolves();
    listSpy.resolves({ Contents: [] });
    const mock = mockClient(S3).on(PutObjectCommand).callsFake(putSpy).on(ListObjectsV2Command).callsFake(listSpy);
    try {
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
      mock.restore();
    }
  }

  @test
  async testGetCertificate() {
    var putSpy = sinon.stub();
    var getZoneForDomainName = sinon.stub(this.deployer, "getZoneForDomainName");
    var doCreateCertificate = sinon.stub(this.deployer, "doCreateCertificate");
    getZoneForDomainName.callsFake(async () => {
      if (getZoneForDomainName.callCount === 1) {
        return undefined;
      }
      return { Id: "1234", HostedZone: "", Name: "", CallerReference: "" };
    });
    doCreateCertificate.resolves({ DomainName: "newlyCreated" });
    putSpy.callsFake(async () => {
      switch (putSpy.callCount) {
        case 1:
          return {
            CertificateSummaryList: [
              {
                DomainName: "none.com"
              }
            ],
            NextToken: "page2"
          };
        case 2:
          return {
            CertificateSummaryList: [
              {
                DomainName: "test.webda.io"
              }
            ]
          };
        default:
          return { CertificateSummaryList: [] };
      }
    });
    const mock = mockClient(ACM).on(ListCertificatesCommand).callsFake(putSpy);
    try {
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
      assert.strictEqual(
        doCreateCertificate.calledWith("test.webda.io", <HostedZone>{
          Id: "1234",
          HostedZone: "",
          Name: "",
          CallerReference: ""
        }),
        true
      );
    } finally {
      mock.restore();
    }
  }

  @test
  async testGetZoneForDomainName() {
    var callSpy = sinon.stub();
    callSpy.callsFake(async () => {
      switch (callSpy.callCount) {
        case 1:
          return { HostedZones: [], NextMarker: "plop" };
        default:
          return {
            HostedZones: [
              { Name: "webda.io." },
              { Name: "bouzouf.io." },
              { Name: "test2.test.webda.io." },
              { Name: "test.webda.io." }
            ]
          };
      }
    });
    const mock = mockClient(Route53).on(ListHostedZonesCommand).callsFake(callSpy);
    try {
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
      mock.restore();
    }
  }

  @test
  async testDoCreateCertificate() {
    var requestCertificate = sinon.stub();
    var describeCertificate = sinon.stub();
    var createDNSEntry = sinon.stub(this.deployer, "createDNSEntry");
    var waitFor = sinon.stub(this.deployer, "waitFor");
    createDNSEntry.callsFake(async () => {});
    describeCertificate.resolves({});
    const mock = mockClient(ACM)
      .on(RequestCertificateCommand)
      .callsFake(requestCertificate)
      .on(DescribeCertificateCommand)
      .callsFake(describeCertificate);
    try {
      waitFor.callsFake(async callback => {
        switch (waitFor.callCount) {
          case 1:
            await callback();
          case 2:
            return new Promise(resolve => callback(resolve));
        }
      });
      describeCertificate.callsFake(async () => {
        if (describeCertificate.callCount === 1) {
          return {
            Certificate: {
              DomainValidationOptions: [{}]
            }
          };
        } else {
          return {
            Certificate: {
              Status: "FAILED",
              DomainValidationOptions: [{ ResourceRecord: "bouzouf" }]
            }
          };
        }
      });
      requestCertificate.callsFake(async () => {
        return { CertificateArn: "plop" };
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
      // @ts-ignore
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
      describeCertificate.callsFake(async () => {
        if (describeCertificate.callCount < 3) {
          return {
            Certificate: {
              Status: "PENDING_VALIDATION"
            }
          };
        } else {
          return {
            Certificate: {
              Status: "ISSUED"
            }
          };
        }
      });
      await this.deployer.doCreateCertificate("test.webda.io.", { Id: "1234", Name: "", CallerReference: "" });
      assert.strictEqual(
        createDNSEntry.calledWith("bouzouf.com", "CNAME", "plop.com.", { Id: "1234", Name: "", CallerReference: "" }),
        true
      );
      assert.strictEqual(describeCertificate.callCount, 3);
      waitFor.resetHistory();
      describeCertificate.resolves({ Certificate: { Status: "ERROR" } });
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
      mock.restore();
    }
  }

  @test
  async testCreateDNSEntry() {
    var callSpy = sinon.stub();
    var getZoneForDomainName = sinon.stub(this.deployer, "getZoneForDomainName");
    getZoneForDomainName.callsFake(async () => {
      if (getZoneForDomainName.callCount === 1) {
        return undefined;
      }
      return { Id: "1234", CallerReference: "", Name: "" };
    });
    callSpy.resolves();
    const mock = mockClient(Route53).on(ChangeResourceRecordSetsCommand).callsFake(callSpy);
    try {
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
      mock.restore();
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
      "af6773b1075007089c46a6d0b8e9ac03abfdb526de0683bfeb723f2448ea3f66"
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
