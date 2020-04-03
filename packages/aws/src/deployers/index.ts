import { Cache } from "@webda/core";
import { Deployer, DeploymentManager } from "@webda/shell";
import * as AWS from "aws-sdk";
import { ACM } from "aws-sdk";
import * as bluebird from "bluebird";
import * as crypto from "crypto";
import * as fs from "fs";
import IamPolicyOptimizer from "iam-policy-optimizer";
import * as mime from "mime-types";
import * as path from "path";
import { IAMPolicyContributor } from "../services";

export interface AWSDeployerResources {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  sessionToken?: string;
  AWSAccountId?: string;
  createMissingResources?: boolean;
  endpoints?: {
    ACM?: string;
    S3?: string;
    STS?: string;
    EC2?: string;
    Route53?: string;
  };
}

export abstract class AWSDeployer<T extends AWSDeployerResources> extends Deployer<T> {
  AWS: any;

  constructor(manager: DeploymentManager, resources: any) {
    super(manager, resources);

    this.resources.accessKeyId = this.resources.accessKeyId || process.env["AWS_ACCESS_KEY_ID"];
    this.resources.secretAccessKey = this.resources.secretAccessKey || process.env["AWS_SECRET_ACCESS_KEY"];
    this.resources.sessionToken = this.resources.sessionToken || process.env["AWS_SESSION_TOKEN"];
    this.resources.region = this.resources.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
    AWS.config.update({
      accessKeyId: this.resources.accessKeyId,
      secretAccessKey: this.resources.secretAccessKey,
      sessionToken: this.resources.sessionToken,
      region: this.resources.region
    });
    this.resources.endpoints = this.resources.endpoints || {};
    this.AWS = AWS;
    this.resources.createMissingResources = this.resources.createMissingResources || false;
  }

  stepper(...args) {
    // TODO Define how to manage stepper and console output
  }

  getRegion(): string {
    return this.AWS.config.region;
  }

  @Cache()
  async getAWSIdentity(): Promise<AWS.STS.GetCallerIdentityResponse> {
    let sts = new this.AWS.STS({
      endpoint: this.resources.endpoints.STS
    });
    return sts.getCallerIdentity().promise();
  }

  @Cache()
  async getDefaultVpc() {
    let defaultVpc = {
      Id: "",
      Subnets: []
    };
    let vpcFilter;
    let ec2 = new this.AWS.EC2({
      endpoint: this.resources.endpoints.EC2
    });
    let res = await ec2.describeVpcs().promise();
    for (let i in res.Vpcs) {
      if (res.Vpcs[i].IsDefault) {
        defaultVpc.Id = res.Vpcs[i].VpcId;
        break;
      }
    }
    if (defaultVpc.Id === "") {
      return undefined;
    }
    vpcFilter = {
      Filters: [
        {
          Name: "vpc-id",
          Values: [defaultVpc.Id]
        }
      ]
    };
    res = await ec2.describeSubnets(vpcFilter).promise();
    for (let i in res.Subnets) {
      defaultVpc.Subnets.push(res.Subnets[i]);
    }
    return defaultVpc;
  }

  protected md5(str: string) {
    return this.hash(str, "md5", "hex");
  }

  protected hash(str: string, type: string = "md5", format: "hex" | "base64" = "hex"): string {
    return crypto
      .createHash("md5")
      .update(str)
      .digest(format);
  }

  _replaceForAWS(id) {
    return id.replace(/\//g, "_");
  }

  async getCertificate(domain: string, region: string = undefined) {
    if (!domain.endsWith(".")) {
      domain = domain + ".";
    }
    let originRegion = this.AWS.config.region;
    try {
      if (region) {
        this.AWS.config.update({ region });
      }
      let acm: AWS.ACM = new this.AWS.ACM({
        endpoint: this.resources.endpoints.ACM
      });
      let params: any = {};
      let res: AWS.ACM.ListCertificatesResponse;
      let certificate;
      do {
        res = await acm.listCertificates(params).promise();
        certificate = res.CertificateSummaryList.filter(cert => cert.DomainName === domain).pop();
        params.NextToken = res.NextToken;
      } while (!certificate && res.NextToken);
      // We did not find the certificate need to create one
      if (!certificate) {
        let zone = await this.getZoneForDomainName(domain);
        if (!zone) {
          throw new Error("Cannot create certificate as Route53 Zone was not found");
        }
        certificate = await this.doCreateCertificate(domain, zone);
      }
      return certificate;
    } finally {
      this.AWS.config.update({ region: originRegion });
    }
  }

  @Cache()
  async getZoneForDomainName(domain): Promise<AWS.Route53.HostedZone> {
    if (!domain.endsWith(".")) {
      domain = domain + ".";
    }
    let targetZone: AWS.Route53.HostedZone;
    // Find the right zone
    let r53: AWS.Route53 = new this.AWS.Route53({
      endpoint: this.resources.endpoints.Route53
    });
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

  async doCreateCertificate(domain: string, zone: AWS.Route53.HostedZone) {
    let acm: AWS.ACM = new this.AWS.ACM({
      endpoint: this.resources.endpoints.S3
    });
    let params = {
      DomainName: domain,
      DomainValidationOptions: [
        {
          DomainName: domain,
          ValidationDomain: domain
        }
      ],
      ValidationMethod: "DNS",
      IdempotencyToken: "Webda_" + this.md5(domain).substr(0, 26)
    };
    let certificate = await acm.requestCertificate(params).promise();
    let cert: ACM.CertificateDetail = <any>await this.waitFor(
      async resolve => {
        let res = await acm.describeCertificate({ CertificateArn: certificate.CertificateArn }).promise();
        if (res.Certificate.DomainValidationOptions[0].ResourceRecord) {
          resolve(res.Certificate);
          return true;
        }
        return false;
      },
      10000,
      5,
      "Waiting for certificate challenge"
    );
    if (cert === undefined || cert.Status === "FAILED") {
      throw new Error("Certificate validation has failed");
    }
    if (cert.Status === "PENDING_VALIDATION") {
      // On create need to wait
      let record = cert.DomainValidationOptions[0].ResourceRecord;
      console.log("Need to validate certificate", cert.CertificateArn);
      await this.createDNSEntry(record.Name, "CNAME", record.Value, zone);
      // Waiting for certificate validation
      await this.waitFor(
        async (resolve, reject) => {
          let res = await acm
            .describeCertificate({
              CertificateArn: cert.CertificateArn
            })
            .promise();
          if (res.Certificate.Status === "ISSUED") {
            resolve(res.Certificate);
            return true;
          }
          if (res.Certificate.Status !== "PENDING_VALIDATION") {
            reject(res.Certificate);
            return true;
          }
        },
        60000,
        10,
        "Waiting for certificate validation"
      );
    }
    //
  }

  async waitFor(callback, delay: number, retries: number, title: string): Promise<any> {
    return new Promise(async (mainResolve, mainReject) => {
      let tries: number = 0;
      while (retries > tries++) {
        if (title) {
          console.log("[" + tries + "/" + retries + "]", title);
        }
        await callback(mainResolve, mainReject);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      mainReject("Timeout while waiting for " + title);
    });
  }

  protected async createDNSEntry(
    domain: string,
    type: string,
    value: string,
    targetZone: AWS.Route53.HostedZone = undefined
  ): Promise<void> {
    let r53 = new this.AWS.Route53({
      endpoint: this.resources.endpoints.S3
    });
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
          Comment: "webda-automated-deploiement"
        }
      })
      .promise();
  }

  getARNPolicy(accountId, region) {
    return [
      {
        Sid: "WebdaLog",
        Effect: "Allow",
        Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: ["arn:aws:logs:" + region + ":" + accountId + ":*"]
      }
    ];
  }

  @Cache()
  async getPolicyDocument() {
    let me = await this.getAWSIdentity();
    let services = this.manager.getWebda().getServices();
    let statements = [];
    // Build policy
    for (let i in services) {
      if ("getARNPolicy" in services[i]) {
        // Update to match recuring policy - might need to split if policy too big
        let res = (<IAMPolicyContributor>(<any>services[i])).getARNPolicy(me.Account, this.AWS.config.region);
        if (Array.isArray(res)) {
          Array.prototype.push.apply(statements, res);
        } else {
          statements.push(res);
        }
      }
    }
    Array.prototype.push.apply(statements, this.getARNPolicy(me.Account, this.AWS.config.region));
    let policyDocument = {
      Version: "2012-10-17",
      Statement: statements
    };
    return IamPolicyOptimizer.reducePolicyObject(policyDocument);
  }

  async createBucket(bucket) {
    let s3 = new this.AWS.S3({
      endpoint: this.resources.endpoints.S3,
      s3ForcePathStyle: this.resources.endpoints.S3 !== undefined
    });
    try {
      await s3
        .headBucket({
          Bucket: bucket
        })
        .promise();
    } catch (err) {
      if (err.code === "Forbidden") {
        console.log("S3 bucket already exists in another account or you do not have permissions on it");
      } else if (err.code === "NotFound") {
        console.log("\tCreating S3 Bucket", bucket);
        // Setup www permission on it
        await s3
          .createBucket({
            Bucket: bucket
          })
          .promise();
      }
    }
  }

  async putFilesOnBucket(bucket, files) {
    let s3 = new this.AWS.S3({
      endpoint: this.resources.endpoints.S3,
      s3ForcePathStyle: this.resources.endpoints.S3 !== undefined
    });
    // Create the bucket
    await this.createBucket(bucket);
    // Should implement multithread here - cleaning too
    await bluebird.map(
      files,
      async file => {
        let info: any = {};
        if (typeof file === "string") {
          info.src = file;
          info.key = path.relative(process.cwd(), file);
        } else if (file.src === undefined || file.key === undefined) {
          throw Error("Should have src and key defined");
        } else {
          info.src = file.src;
          info.key = file.key;
        }
        // Need to have mimetype to serve the content correctly
        let mimetype = mime.contentType(path.extname(info.src));
        await s3
          .putObject({
            Bucket: bucket,
            Body: fs.createReadStream(info.src),
            Key: info.key,
            ContentType: mimetype
          })
          .promise();
        console.log("Uploaded", info.src, "to", info.key, "(" + mimetype + ")");
      },
      { concurrency: 5 }
    );
  }
}
