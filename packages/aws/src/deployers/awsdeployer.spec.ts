import {
  ACM,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand
} from "@aws-sdk/client-acm";
import { DescribeSubnetsCommand, DescribeVpcsCommand, EC2 } from "@aws-sdk/client-ec2";
import { ChangeResourceRecordSetsCommand, Route53 } from "@aws-sdk/client-route-53";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NotFound,
  PutBucketTaggingCommand,
  PutObjectCommand,
  S3
} from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STS } from "@aws-sdk/client-sts";
import { InstanceCache, Service } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/index.js";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { fastWait } from "../../test/fixture.js";
import { Route53Service } from "../services/route53.service.js";
import { AWSDeployer, AWSDeployerParameters } from "./awsdeployer.js";

/**
 * Concrete deployer for the tests
 */
class TestAWSDeployer extends AWSDeployer<AWSDeployerParameters> {}

/**
 * Service contributing to the IAM policy
 */
class PolicyContributor extends Service {
  /**
   * @returns two statements
   */
  getARNPolicy() {
    return [
      { Sid: "A", Effect: "Allow", Action: ["s3:GetObject"], Resource: "arn:aws:s3:::a/*" },
      { Sid: "B", Effect: "Allow", Action: ["sqs:SendMessage"], Resource: "arn:aws:sqs:::b" }
    ];
  }
}

@suite
class AWSDeployerTest extends WebdaApplicationTest {
  deployer: TestAWSDeployer;
  mocks: { restore: () => void }[] = [];

  getTestConfiguration(): any {
    return {
      version: 3,
      parameters: {},
      services: {
        Contributor: { type: "Test/PolicyContributor" }
      }
    };
  }

  async tweakApp(app: any) {
    await super.tweakApp(app);
    app.addModda("Test/PolicyContributor", PolicyContributor);
  }

  async beforeEach() {
    await super.beforeEach();
    this.deployer = new TestAWSDeployer(
      "Deployer",
      new AWSDeployerParameters().load({ type: "Test/Deployer", Tags: { Team: "webda" } })
    );
    await this.deployer.prepare();
  }

  async afterEach() {
    this.mocks.forEach(mock => mock.restore());
    this.mocks = [];
    vi.restoreAllMocks();
  }

  /**
   * Mock an AWS client and restore it after the test
   * @param client - the client class
   * @returns the mock
   */
  mock(client: any): any {
    const mock = mockClient(client);
    this.mocks.push(mock);
    return mock;
  }

  @test
  async prepare() {
    const env = { ...process.env };
    try {
      process.env.AWS_DEFAULT_REGION = "eu-west-3";
      process.env.AWS_ACCESS_KEY_ID = "KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "SECRET";
      const deployer = new TestAWSDeployer(
        "Stack",
        new AWSDeployerParameters().load({
          type: "Test/Deployer",
          Tags: [{ Key: "A", Value: "B" }],
          endpoints: { S3: "http://localhost:4566" },
          Bucket: "${deployer.name}-${resources.region}"
        })
      );
      const resources = await deployer.prepare();
      assert.strictEqual(resources.name, "Stack");
      assert.strictEqual(resources.region, "eu-west-3");
      assert.strictEqual(resources.Bucket, "Stack-eu-west-3");
      assert.deepStrictEqual(resources.Tags, [{ Key: "A", Value: "B" }]);
      assert.deepStrictEqual(deployer.getClientConfig("S3"), {
        region: "eu-west-3",
        endpoint: "http://localhost:4566",
        credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET", sessionToken: undefined }
      });
      assert.deepStrictEqual(deployer.getClientConfig("EC2", "us-west-2"), {
        region: "us-west-2",
        credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET", sessionToken: undefined }
      });
    } finally {
      process.env = env;
    }
    // Tags map are transformed to array
    assert.deepStrictEqual(this.deployer.resources.Tags, [{ Key: "Team", Value: "webda" }]);
  }

  @test
  tags() {
    const deployer = this.deployer;
    assert.deepStrictEqual(deployer.transformMapTagsToArray([{ Key: "Test", Value: "Plop" }]), [
      { Key: "Test", Value: "Plop" }
    ]);
    assert.deepStrictEqual(deployer.transformArrayTagsToMap({ a: "b" }), { a: "b" });
    deployer.resources["Lambda"] = { Tags: { Team: "lambda", Fn: "1" } };
    assert.deepStrictEqual(deployer.getDefaultTags("Lambda"), [
      { Key: "Team", Value: "lambda" },
      { Key: "Fn", Value: "1" }
    ]);
    assert.deepStrictEqual(deployer.getDefaultTags("Unknown"), [{ Key: "Team", Value: "webda" }]);
    assert.deepStrictEqual(deployer.getDefaultTagsAsMap({ Other: "o" }), { Other: "o", Team: "webda" });
    assert.strictEqual(deployer.getDefaultTagsAsS3Tagging([{ Key: "a b", Value: "c&d" }]), "a%20b=c%26d&Team=webda");
  }

  @test
  utilities() {
    const deployer: any = this.deployer;
    assert.strictEqual(deployer.commonPrefix("/test/bouzf", "/test/reffff"), "/test/");
    assert.strictEqual(deployer.commonPrefix("test/bouzf", "/test/reffff"), "");
    assert.strictEqual(deployer.commonPrefix("test/bouzf", "test/bouzf212"), "test/bouzf");
    assert.strictEqual(deployer.md5("webda"), createHash("md5").update("webda").digest("hex"));
    assert.strictEqual(
      deployer.hash("webda", "sha256", "base64"),
      createHash("sha256").update("webda").digest("base64")
    );
    assert.strictEqual(deployer._replaceForAWS("Webda/Service/Test"), "Webda_Service_Test");
    assert.deepStrictEqual(deployer.getARNPolicy("123", "us-east-1")[0].Resource, ["arn:aws:logs:us-east-1:123:*"]);
  }

  @test
  async identityAndPolicy() {
    this.mock(STS).on(GetCallerIdentityCommand).resolves({ Account: "666111333" });
    assert.strictEqual((await this.deployer.getAWSIdentity()).Account, "666111333");
    const policy = await this.deployer.getPolicyDocument([
      { Sid: "Extra", Effect: "Allow", Action: ["s3:ListBucket"], Resource: "*" }
    ]);
    assert.strictEqual(policy.Version, "2012-10-17");
    const actions = policy.Statement.flatMap(s => [].concat(s.Action));
    // Services contributions, the logs and the additional statements
    assert.ok(actions.includes("s3:GetObject"));
    assert.ok(actions.includes("sqs:SendMessage"));
    assert.ok(actions.includes("logs:PutLogEvents"));
    assert.ok(actions.includes("s3:ListBucket"));
    // The deployers are not part of the application services
    assert.ok(!this.deployer.getApplicationServices().includes(this.deployer));
  }

  @test
  async defaultVpc() {
    let vpcCalls = 0;
    const subnets = vi.fn().mockResolvedValue({ Subnets: [{ SubnetId: "subnet-1" }, { SubnetId: "subnet-2" }] });
    this.mock(EC2)
      .on(DescribeVpcsCommand)
      .callsFake(async () =>
        ++vpcCalls === 1
          ? { Vpcs: [] }
          : {
              Vpcs: [
                { VpcId: "vpc-667", IsDefault: false },
                { VpcId: "vpc-666", IsDefault: true }
              ]
            }
      )
      .on(DescribeSubnetsCommand)
      .callsFake(subnets);
    assert.strictEqual(await this.deployer.getDefaultVpc(), undefined);
    assert.strictEqual(subnets.mock.calls.length, 0);
    InstanceCache.clearAll(this.deployer);
    assert.deepStrictEqual(await this.deployer.getDefaultVpc(), {
      Id: "vpc-666",
      Subnets: [{ SubnetId: "subnet-1" }, { SubnetId: "subnet-2" }]
    });
    assert.deepStrictEqual(subnets.mock.calls[0][0], { Filters: [{ Name: "vpc-id", Values: ["vpc-666"] }] });
  }

  @test
  async createBucket() {
    let heads = 0;
    const create = vi.fn().mockResolvedValue({});
    const tagging = vi.fn().mockResolvedValue({});
    this.mock(S3)
      .on(HeadBucketCommand)
      .callsFake(async () => {
        heads++;
        if (heads === 2) {
          throw Object.assign(new Error("Forbidden"), { name: "Forbidden" });
        } else if (heads === 3) {
          throw new NotFound({ $metadata: {}, message: "" });
        }
        return {};
      })
      .on(CreateBucketCommand)
      .callsFake(create)
      .on(PutBucketTaggingCommand)
      .callsFake(tagging);
    // Bucket exists
    await this.deployer.createBucket("plop");
    assert.strictEqual(create.mock.calls.length, 0);
    // Bucket exists in another account
    await this.deployer.createBucket("plop");
    assert.strictEqual(create.mock.calls.length, 0);
    // Bucket does not exist
    await this.deployer.createBucket("plop");
    assert.deepStrictEqual(create.mock.calls[0][0], { Bucket: "plop" });
    assert.deepStrictEqual(tagging.mock.calls[0][0], {
      Bucket: "plop",
      Tagging: { TagSet: [{ Key: "Team", Value: "webda" }] }
    });
  }

  @test
  async putFiles() {
    const dir = mkdtempSync(join(tmpdir(), "webda-s3-"));
    try {
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "same.txt"), "same content");
      writeFileSync(join(dir, "sub/changed.html"), "<html></html>");
      const uploads = [];
      vi.spyOn(this.deployer, "createBucket").mockResolvedValue();
      let page = 0;
      this.mock(S3)
        .on(ListObjectsV2Command)
        .callsFake(async () =>
          page++ === 0
            ? {
                Contents: [
                  {
                    Key: "site/same.txt",
                    Size: 12,
                    ETag: `"${createHash("md5").update("same content").digest("hex")}"`
                  }
                ],
                NextContinuationToken: "next"
              }
            : { Contents: [{ Key: "site/sub/changed.html", Size: 13, ETag: '"other"' }] }
        )
        .on(PutObjectCommand)
        .callsFake(async args => {
          uploads.push(args);
          // Read the file streams while the files exist
          if (typeof args.Body?.pipe === "function") {
            for await (const chunk of args.Body) {
              void chunk;
            }
          }
          return {};
        });
      await this.deployer.putFilesOnBucket("bucket", []);
      assert.strictEqual(uploads.length, 0);
      await assert.rejects(
        // @ts-ignore missing src
        () => this.deployer.putFilesOnBucket("bucket", [{ key: "test" }]),
        /Should have src and key defined/
      );
      await this.deployer.putFolderOnBucket("bucket", dir, "site/");
      // The unchanged file is skipped
      assert.deepStrictEqual(
        uploads.map(u => u.Key),
        ["site/sub/changed.html"]
      );
      assert.strictEqual(uploads[0].ContentType, "text/html; charset=utf-8");
      assert.strictEqual(uploads[0].Tagging, "Team=webda");
      uploads.length = 0;
      await this.deployer.putFilesOnBucket("bucket", [
        { key: "buffer.out", src: Buffer.from("bouzouf"), mimetype: "text/plain" },
        { key: "unknown", src: Buffer.from("data") }
      ]);
      assert.strictEqual(uploads[0].Body.toString(), "bouzouf");
      assert.strictEqual(uploads[0].ContentType, "text/plain");
      assert.strictEqual(uploads[1].ContentType, "application/octet-stream");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  async getCertificate() {
    const zone = vi.spyOn(this.deployer, "getZoneForDomainName").mockResolvedValue(undefined);
    const create = vi.spyOn(this.deployer, "doCreateCertificate").mockResolvedValue(<any>{ DomainName: "created" });
    let lists = 0;
    this.mock(ACM)
      .on(ListCertificatesCommand)
      .callsFake(async () =>
        ++lists % 2 === 1
          ? { CertificateSummaryList: [{ DomainName: "none.com" }], NextToken: "page2" }
          : { CertificateSummaryList: [{ DomainName: "test.webda.io", CertificateArn: "arn:existing" }] }
      );
    // Found on the second page, the trailing dot is removed
    assert.strictEqual((await this.deployer.getCertificate("test.webda.io.")).CertificateArn, "arn:existing");
    // Not found and no zone
    await assert.rejects(() => this.deployer.getCertificate("other.webda.io"), /Route53 Zone was not found/);
    // Not found, created
    zone.mockResolvedValue({ Id: "zone", Name: "webda.io.", CallerReference: "" });
    assert.deepStrictEqual(await this.deployer.getCertificate("other.webda.io", "us-east-1"), {
      DomainName: "created"
    });
    assert.strictEqual(create.mock.calls[0][0], "other.webda.io");
    assert.strictEqual(create.mock.calls[0][2], "us-east-1");
  }

  @test
  async doCreateCertificate() {
    fastWait(this.deployer);
    const dns = vi.spyOn(this.deployer, "createDNSEntry").mockResolvedValue();
    const zone = { Id: "zone", Name: "webda.io.", CallerReference: "" };
    const statuses = [
      { Status: "PENDING_VALIDATION" },
      {
        Status: "PENDING_VALIDATION",
        CertificateArn: "arn:cert",
        DomainValidationOptions: [{ ResourceRecord: { Name: "_check.webda.io", Value: "validate" } }]
      },
      { Status: "PENDING_VALIDATION", CertificateArn: "arn:cert" },
      { Status: "ISSUED", CertificateArn: "arn:cert" }
    ];
    const request = vi.fn().mockResolvedValue({ CertificateArn: "arn:cert" });
    this.mock(ACM)
      .on(RequestCertificateCommand)
      .callsFake(request)
      .on(DescribeCertificateCommand)
      .callsFake(async () => ({ Certificate: statuses.shift() ?? { Status: "FAILED" } }));
    const cert = await this.deployer.doCreateCertificate("test.webda.io.", zone);
    assert.strictEqual(cert.Status, "ISSUED");
    assert.strictEqual(request.mock.calls[0][0].DomainName, "test.webda.io");
    assert.match(request.mock.calls[0][0].IdempotencyToken, /^Webda_[0-9a-f]{26}$/);
    assert.deepStrictEqual(dns.mock.calls[0], ["_check.webda.io", "CNAME", "validate", zone]);
    // Validation failed
    statuses.push({
      Status: "FAILED",
      // @ts-ignore partial
      DomainValidationOptions: [{ ResourceRecord: { Name: "_check.webda.io", Value: "validate" } }]
    });
    await assert.rejects(() => this.deployer.doCreateCertificate("test.webda.io", zone), /validation has failed/);
    // Validation rejected after the DNS entry
    statuses.push(
      // @ts-ignore partial
      {
        Status: "PENDING_VALIDATION",
        CertificateArn: "arn:cert",
        DomainValidationOptions: [{ ResourceRecord: { Name: "_check.webda.io", Value: "validate" } }]
      },
      { Status: "VALIDATION_TIMED_OUT", CertificateArn: "arn:cert" }
    );
    await assert.rejects(() => this.deployer.doCreateCertificate("test.webda.io", zone));
  }

  @test
  async createDNSEntry() {
    const changes = vi.fn().mockResolvedValue({});
    this.mock(Route53).on(ChangeResourceRecordSetsCommand).callsFake(changes);
    const zone = vi.spyOn(Route53Service, "getZoneForDomainName").mockResolvedValue(undefined);
    await assert.rejects(
      () => this.deployer.createDNSEntry("webda.io", "CNAME", "loopingz.com"),
      /Domain is not handled on AWS/
    );
    zone.mockResolvedValue({ Id: "zone", Name: "webda.io.", CallerReference: "" });
    InstanceCache.clearAll(this.deployer);
    await this.deployer.createDNSEntry("webda.io", "CNAME", "loopingz.com");
    assert.strictEqual(changes.mock.calls[0][0].HostedZoneId, "zone");
    assert.deepStrictEqual(changes.mock.calls[0][0].ChangeBatch.Changes[0].ResourceRecordSet, {
      Name: "webda.io.",
      ResourceRecords: [{ Value: "loopingz.com" }],
      TTL: 360,
      Type: "CNAME"
    });
  }
}
