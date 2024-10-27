import { ACM, CertificateDetail, ListCertificatesResponse, RequestCertificateCommandInput } from "@aws-sdk/client-acm";
import { EC2 } from "@aws-sdk/client-ec2";
import { HostedZone, RRType, Route53 } from "@aws-sdk/client-route-53";
import { NotFound, S3 } from "@aws-sdk/client-s3";
import { GetCallerIdentityResponse, STS } from "@aws-sdk/client-sts";
import { Cache, DeployerResources, WaitFor, WaitLinearDelay, WebdaError } from "@webda/core";
import { Deployer, DeploymentManager } from "@webda/shell";
import bluebird from "bluebird";
import * as crypto from "crypto";
import { randomUUID } from "crypto";
import * as fs from "fs";
import { globSync } from "glob";
import IamPolicyOptimizer from "iam-policy-optimizer";
import * as mime from "mime-types";
import * as path from "path";
import { IAMPolicyContributor } from "../services";
import { Route53Service } from "../services/route53";

export type TagsDefinition = { Key: string; Value: string }[] | { [key: string]: string };

/**
 * Common resources for all AWS Deployers
 */
export interface AWSDeployerResources extends DeployerResources {
  /**
   * AWS_ACCESS_KEY_ID to use
   *
   * Using static key is not recommended
   */
  accessKeyId?: string;
  /**
   * AWS_SECRET_ACCESS_KEY to use
   *
   * Using static key is not recommended
   */
  secretAccessKey?: string;
  /**
   * AWS_REGION to use
   *
   * @default "us-east-1"
   */
  region?: string;
  /**
   * AWS_SESSION_TOKEN Token
   *
   * Even if it is possible to add it here
   * It is not sustainable as this token at its best will
   * have a lifetime of 12 hours
   */
  sessionToken?: string;
  /**
   * AWS Account Id
   */
  AWSAccountId?: string;
  /**
   * Endpoints to use by differents services
   * Usefull to test with localstack or other AWS emulations
   */
  endpoints?: {
    ACM?: string;
    S3?: string;
    STS?: string;
    EC2?: string;
    Route53?: string;
  };

  /**
   * Default Tags to use with resources created by deployers
   */
  Tags?: TagsDefinition;
  /**
   * SSL certificates to create
   *
   * Sample
   * ```
   * Certificates: {
   *   "test.webda.io": {
   *      SubjectAlternativeNames: ["test2.webda.io"]
   *   }
   * }
   * ```
   */
  Certificates?: {
    [key: string]: {
      /**
       * Any alternative names to add to the certificate
       */
      SubjectAlternativeNames?: string[];
      Tags?: TagsDefinition;
    };
  };
}

/**
 * Abstract AWS Deployer
 *
 * It includes some basic utilities methods to be used by
 * final deployers
 */
export abstract class AWSDeployer<T extends AWSDeployerResources> extends Deployer<T> {
  constructor(manager: DeploymentManager, resources: any) {
    super(manager, resources);

    this.resources.accessKeyId = this.resources.accessKeyId || process.env["AWS_ACCESS_KEY_ID"];
    this.resources.secretAccessKey = this.resources.secretAccessKey || process.env["AWS_SECRET_ACCESS_KEY"];
    this.resources.sessionToken = this.resources.sessionToken || process.env["AWS_SESSION_TOKEN"];
    this.resources.region = this.resources.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
    this.resources.endpoints = this.resources.endpoints || {};
    this.resources.Tags = this.resources.Tags || {};
    if (!Array.isArray(this.resources.Tags)) {
      this.resources.Tags = this.transformMapTagsToArray(this.resources.Tags);
    }
  }

  /**
   * Return AWS region
   */
  getRegion(): string {
    return this.resources.region;
  }

  /**
   * Return the current AWS Identity used
   */
  @Cache()
  async getAWSIdentity(): Promise<GetCallerIdentityResponse> {
    const sts = new STS({
      endpoint: this.resources.endpoints.STS
    });
    return sts.getCallerIdentity({});
  }

  /**
   * Return the default VPC for the current region
   */
  @Cache()
  async getDefaultVpc() {
    const defaultVpc = {
      Id: "",
      Subnets: []
    };
    const ec2 = new EC2({
      endpoint: this.resources.endpoints.EC2
    });
    const res = await ec2.describeVpcs({});
    for (const i in res.Vpcs) {
      if (res.Vpcs[i].IsDefault) {
        defaultVpc.Id = res.Vpcs[i].VpcId;
        break;
      }
    }
    if (defaultVpc.Id === "") {
      return undefined;
    }
    const vpcFilter = {
      Filters: [
        {
          Name: "vpc-id",
          Values: [defaultVpc.Id]
        }
      ]
    };
    const res2 = await ec2.describeSubnets(vpcFilter);
    for (const i in res2.Subnets) {
      defaultVpc.Subnets.push(res2.Subnets[i]);
    }
    return defaultVpc;
  }

  /**
   * Generate a MD5 in hex
   * @param str to hash
   */
  protected md5(str: string) {
    return this.hash(str, "md5", "hex");
  }

  /**
   * Hash the string
   *
   * @param str to hash
   * @param type of hash
   * @param format hex or b64
   */
  protected hash(str: string, type: string = "md5", format: "hex" | "base64" = "hex"): string {
    return crypto.createHash(type).update(str).digest(format);
  }

  /**
   * Replace / by _ as theses ID are not allowed in AWS
   *
   * @param id
   */
  _replaceForAWS(id: string) {
    return id.replace(/\//g, "_");
  }

  /**
   * Get a certificate or create it
   *
   * @param domain to get certificate for
   * @param region
   */
  async getCertificate(domain: string, region: string = undefined) {
    if (domain.endsWith(".")) {
      domain = domain.substring(0, domain.length - 1);
    }
    const acm: ACM = new ACM({
      endpoint: this.resources.endpoints.ACM,
      region
    });
    const params: any = {};
    let res: ListCertificatesResponse;
    let certificate;
    do {
      res = await acm.listCertificates(params);
      certificate = res.CertificateSummaryList.filter(cert => cert.DomainName === domain).pop();
      params.NextToken = res.NextToken;
    } while (!certificate && res.NextToken);
    // We did not find the certificate need to create one
    if (!certificate) {
      const zone = await this.getZoneForDomainName(domain);
      if (!zone) {
        throw new WebdaError.CodeError("ROUTE53_NOTFOUND", "Cannot create certificate as Route53 Zone was not found");
      }
      this.logger.log("INFO", "Creating a certificate for", domain);
      certificate = await this.doCreateCertificate(domain, zone);
    }

    return certificate;
  }

  /**
   * Get the closest zone to the domain
   *
   * @param domain to get zone for
   */
  @Cache()
  async getZoneForDomainName(domain): Promise<HostedZone> {
    return Route53Service.getZoneForDomainName(domain);
  }

  /**
   * Transform a tag map into a tag array
   *
   * @param tags
   */
  transformMapTagsToArray(tags: TagsDefinition): { Key: string; Value: string }[] {
    if (Array.isArray(tags)) {
      return tags;
    }
    const res = [];
    for (const i in tags) {
      res.push({ Key: i, Value: tags[i] });
    }
    return res;
  }

  /**
   * Transform a tag array into a tag map
   *
   * @param tags
   */
  transformArrayTagsToMap(tags: TagsDefinition): { [key: string]: string } {
    if (!Array.isArray(tags)) {
      return tags;
    }
    const res = {};
    tags.forEach(t => (res[t.Key] = t.Value));
    return res;
  }

  /**
   * Take this.resources[key].Tags and add all remaining Tags from this.resources.Tags
   *
   * @param key of the resources to add
   */
  getDefaultTags(key: string | TagsDefinition = undefined): { Key: string; Value: string }[] {
    let Tags;
    if (typeof key === "string") {
      Tags = this.resources[key] ? this.transformMapTagsToArray(this.resources[key].Tags) || [] : [];
    } else {
      Tags = this.transformMapTagsToArray(key) || [];
    }
    if (this.resources.Tags.length) {
      const TagKeys = Tags.map(t => t.Key);
      Tags.push(...(<any[]>this.resources.Tags).filter(t => TagKeys.indexOf(t.Key) < 0));
    }
    return Tags;
  }

  /**
   * Take this.resources[key].Tags and add all remaining Tags from this.resources.Tags
   *
   * @param key of the resources to add
   */
  getDefaultTagsAsMap(key: string | TagsDefinition = undefined): {
    [key: string]: string;
  } {
    return this.transformArrayTagsToMap(this.getDefaultTags(key));
  }

  /**
   * Return the S3 Tagging string
   * @param key of the resources to add
   */
  getDefaultTagsAsS3Tagging(key: string | TagsDefinition = undefined) {
    return this.getDefaultTags(key)
      .map(tag => `${encodeURIComponent(tag.Key)}=${encodeURIComponent(tag.Value)}`)
      .join("&");
  }

  async waitFor(
    callback: (resolve?: (value?: any) => void, reject?: (reason?: any) => void) => Promise<boolean>,
    retries: number,
    title: string,
    delay: number
  ) {
    return WaitFor(callback, retries, title, this.logger, WaitLinearDelay(delay));
  }
  /**
   * Create a certificate for a domain
   * Will use Route 53 to do the validation
   *
   * @param domain to create the certificate for
   * @param zone
   */
  async doCreateCertificate(domain: string, zone: HostedZone) {
    const acm: ACM = new ACM({
      endpoint: this.resources.endpoints.S3
    });
    if (domain.endsWith(".")) {
      domain = domain.substring(0, domain.length - 1);
    }
    const params: RequestCertificateCommandInput = {
      DomainName: domain,
      DomainValidationOptions: [
        {
          DomainName: domain,
          ValidationDomain: domain
        }
      ],
      ValidationMethod: "DNS",
      IdempotencyToken: "Webda_" + this.md5(domain).substring(0, 26)
    };
    const certificate = await acm.requestCertificate(params);
    let cert: CertificateDetail = await this.waitFor(
      async resolve => {
        const res = await acm.describeCertificate({
          CertificateArn: certificate.CertificateArn
        });
        if (res.Certificate.DomainValidationOptions && res.Certificate.DomainValidationOptions[0].ResourceRecord) {
          resolve(res.Certificate);
          return true;
        }
        return false;
      },
      5,
      "Waiting for certificate challenge",
      10000
    );
    if (cert === undefined || cert.Status === "FAILED") {
      throw new WebdaError.CodeError("ACM_VALIDATION_FAILED", "Certificate validation has failed");
    }
    if (cert.Status === "PENDING_VALIDATION") {
      // On create need to wait
      const record = cert.DomainValidationOptions[0].ResourceRecord;
      this.logger.log("INFO", "Need to validate certificate", cert.CertificateArn);
      await this.createDNSEntry(record.Name, "CNAME", record.Value, zone);
      // Waiting for certificate validation
      cert = await this.waitFor(
        async (resolve, reject) => {
          const res = await acm.describeCertificate({
            CertificateArn: cert.CertificateArn
          });
          if (res.Certificate.Status === "ISSUED") {
            resolve(res.Certificate);
            return true;
          }
          if (res.Certificate.Status !== "PENDING_VALIDATION") {
            reject(res.Certificate);
            return true;
          }
        },
        10,
        "Waiting for certificate validation",
        60000
      );
    }
    //
    return cert;
  }

  /**
   * Create DNS entry
   *
   * @param domain to create
   * @param type of DNS
   * @param value the value of the record
   * @param targetZone
   */
  public async createDNSEntry(
    domain: string,
    type: RRType,
    value: string,
    targetZone: HostedZone = undefined
  ): Promise<void> {
    this.logger.log("INFO", `Creating DNS entry ${domain} ${type} ${value}`);
    const r53 = new Route53({
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
    await r53.changeResourceRecordSets({
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
    });
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

  /**
   * Generate the `PolicyDocument`
   *
   * It will browse all services for a method `getARNPolicy`
   * Allowing you to write some specific Service or Bean that
   * requires specific AWS permissions
   */
  @Cache()
  async getPolicyDocument(additionalStatements: any[] = []) {
    const me = await this.getAWSIdentity();
    const services = this.manager.getWebda().getServices();
    const statements = [];
    // Build policy
    for (const i in services) {
      if ("getARNPolicy" in services[i]) {
        // Update to match recuring policy - might need to split if policy too big
        const res = (<IAMPolicyContributor>(<any>services[i])).getARNPolicy(me.Account, this.getRegion());
        if (Array.isArray(res)) {
          statements.push(...res);
        } else {
          statements.push(res);
        }
      }
    }
    statements.push(...this.getARNPolicy(me.Account, this.getRegion()));
    const policyDocument = {
      Version: "2012-10-17",
      Statement: [...statements, ...additionalStatements]
    };

    // @ts-ignore
    return IamPolicyOptimizer.default?.reducePolicyObject(policyDocument);
  }

  /**
   * Create a bucket if it does not exist
   *
   * @param bucket to create
   */
  async createBucket(Bucket: string): Promise<void> {
    const s3 = new S3({
      endpoint: this.resources.endpoints.S3,
      forcePathStyle: this.resources.endpoints.S3 !== undefined
    });
    try {
      await s3.headBucket({
        Bucket
      });
    } catch (err) {
      if (err.name === "Forbidden") {
        this.logger.log("ERROR", "S3 bucket already exists in another account or you do not have permissions on it");
      } else if (err instanceof NotFound) {
        this.logger.log("INFO", "\tCreating S3 Bucket", Bucket);
        // Setup www permission on it
        await s3.createBucket({
          Bucket: Bucket
        });
        const Tags = this.getDefaultTags([]);
        if (Tags.length) {
          await s3.putBucketTagging({
            Bucket,
            Tagging: {
              TagSet: Tags
            }
          });
        }
      }
    }
  }

  /**
   * Send a full folder (recursive) on bucket
   *
   * @param bucket to send data to
   * @param folder path to local folder to send
   * @param prefix prefix on the bucket
   */
  async putFolderOnBucket(bucket: string, folder: string, prefix: string = "") {
    const absFolder = path.resolve(folder);
    const files = globSync(`${absFolder}/**/*`);
    await this.putFilesOnBucket(
      bucket,
      // Replace \ by / for Windows system
      files.map(f => ({
        key: `${prefix}${path.relative(absFolder, f).replace(/\\/g, "/")}`,
        src: f
      }))
    );
  }

  /**
   * Find the common prefix between two strings
   *
   * Example
   * ```
   * commonPrefix("/test/plop1", "/templates/") => "/te"
   * ```
   *
   *
   * @param str1 to compare
   * @param str2 to compare
   */
  commonPrefix(str1: string, str2: string): string {
    let res = "";
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      res += str1[i];
      i++;
    }
    return res;
  }

  /**
   * Add files to a bucket
   *
   * It uses hash and ETag to avoid uploading files already present
   *
   *
   * The files src can be either:
   *  - a string representing the local path
   *  - a Buffer with the dynamic content
   *
   * @param bucket to send bucket
   * @param files to send
   */
  async putFilesOnBucket(bucket: string, files: { key?: string; src: any; mimetype?: string }[]) {
    const s3 = new S3({
      endpoint: this.resources.endpoints.S3,
      forcePathStyle: this.resources.endpoints.S3 !== undefined
    });
    if (!files.length) {
      return;
    }
    files.forEach(f => {
      if (f.src === undefined) {
        throw Error("Should have src and key defined");
      } else if (!f.key) {
        f.key = path.relative(process.cwd(), f.src);
      }
    });

    // Create the bucket
    await this.createBucket(bucket);
    // Retrieve current files to only upload the one we do not have
    const currentFiles = {};
    const Prefix = files.reduce((prev, cur) => this.commonPrefix(prev, cur.key), files[0].key);
    const Params = {
      Bucket: bucket,
      Prefix,
      MaxKeys: 1000,
      ContinuationToken: undefined
    };
    do {
      const res = await s3.listObjectsV2(Params);
      res.Contents.forEach(obj => {
        currentFiles[obj.Key] = obj;
      });
      Params.ContinuationToken = res.NextContinuationToken;
    } while (Params.ContinuationToken);
    // Should implement multithread here - cleaning too
    const uuid = randomUUID();
    let fullSize = 0;
    files = files.filter(info => {
      if (typeof info.src === "string") {
        const s3obj = currentFiles[info.key];
        const fd = fs.openSync(info.src, "r");
        const stat = fs.fstatSync(fd);
        if (s3obj && stat.size === s3obj.Size) {
          const md5 = `"${this.hash(fs.readFileSync(info.src).toString(), "md5", "hex")}"`;
          if (md5 === s3obj.ETag) {
            this.logger.log("TRACE", "Skipping upload of", info.src, "file with same hash already on bucket");
            return false;
          }
        }
        fullSize += stat.size;
      }
      return true;
    });
    this.logger.logProgressStart(uuid, files.length, "Uploading to S3 bucket " + bucket);
    await bluebird.map(
      files,
      async info => {
        // Need to have mimetype to serve the content correctly
        const mimetype = info.mimetype || mime.contentType(path.extname(info.key)) || "application/octet-stream";
        // use of upload and get size length
        await s3.putObject({
          Bucket: bucket,
          Body: typeof info.src === "string" ? fs.createReadStream(info.src) : info.src,
          Key: info.key,
          ContentType: mimetype,
          Tagging: this.getDefaultTagsAsS3Tagging()
        });
        this.logger.logProgressIncrement(1, uuid);
        this.logger.log(
          "INFO",
          "Uploaded",
          typeof info.src === "string" ? info.src : "<dynamicContent>",
          "to",
          `s3://${bucket}/${info.key}`,
          "(" + mimetype + ")"
        );
      },
      { concurrency: 5 }
    );
  }
}
