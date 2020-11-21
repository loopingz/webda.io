import { Cache, WebdaError } from "@webda/core";
import { Deployer, DeployerResources, DeploymentManager } from "@webda/shell";
import * as AWS from "aws-sdk";
import { ACM } from "aws-sdk";
import * as bluebird from "bluebird";
import * as crypto from "crypto";
import * as fs from "fs";
import * as glob from "glob";
import IamPolicyOptimizer from "iam-policy-optimizer";
import * as mime from "mime-types";
import * as path from "path";
import { IAMPolicyContributor } from "../services";
import { v4 as uuidv4 } from "uuid";

export type TagsDefinition = { Key: string; Value: string }[] | { [key: string]: string };
export interface AWSDeployerResources extends DeployerResources {
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

  // Default Tags
  Tags?: TagsDefinition;
  // Certificates
  Certificates?: {
    [key: string]: {
      SubjectAlternativeNames?: string[];
      Tags?: TagsDefinition;
    };
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
    this.resources.Tags = this.resources.Tags || {};
    if (Array.isArray(this.resources.Tags)) {
      this.resources.Tags = this.transformMapTagsToArray(this.resources.Tags);
    }
    this.AWS = AWS;
    this.resources.createMissingResources = this.resources.createMissingResources || false;
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
    return crypto.createHash("md5").update(str).digest(format);
  }

  _replaceForAWS(id) {
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
      domain = domain.substr(0, domain.length - 1);
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
          throw new WebdaError("ROUTE53_NOTFOUND", "Cannot create certificate as Route53 Zone was not found");
        }
        this.logger.log("INFO", "Creating a certificate for", domain);
        certificate = await this.doCreateCertificate(domain, zone);
      }

      return certificate;
    } finally {
      this.AWS.config.update({ region: originRegion });
    }
  }

  /**
   * Get the closest zone to the domain
   *
   * @param domain to get zone for
   */
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

  /**
   * Transform a tag map into a tag array
   *
   * @param tags
   */
  transformMapTagsToArray(tags: TagsDefinition): { Key: string; Value: string }[] {
    if (Array.isArray(tags)) {
      return tags;
    }
    let res = [];
    for (let i in tags) {
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
    let res = {};
    tags.forEach(t => (res[t.Key] = t.Value));
    return res;
  }

  /**
   * Take this.resources[key].Tags and add all remaining Tags from this.resources.Tags
   *
   * @param key of the resources to add
   */
  getDefaultTags(key: string | object[] = undefined): { Key: string; Value: string }[] {
    let Tags;
    if (typeof key === "string") {
      Tags = this.resources[key] ? this.transformMapTagsToArray(this.resources[key].Tags) || [] : [];
    } else {
      Tags = key || [];
    }
    if (this.resources.Tags.length) {
      let TagKeys = Tags.map(t => t.Key);
      Tags.push(...(<any[]>this.resources.Tags).filter(t => TagKeys.indexOf(t.Key) < 0));
    }
    return Tags;
  }

  /**
   * Take this.resources[key].Tags and add all remaining Tags from this.resources.Tags
   *
   * @param key of the resources to add
   */
  getDefaultTagsAsMap(key: string | object[] = undefined): { [key: string]: string } {
    return this.transformArrayTagsToMap(this.getDefaultTags(key));
  }

  /**
   * Return the S3 Tagging string
   * @param key of the resources to add
   */
  getDefaultTagsAsS3Tagging(key: string | object[] = undefined) {
    return this.getDefaultTags(key)
      .map(tag => `${encodeURIComponent(tag.Key)}=${encodeURIComponent(tag.Value)}`)
      .join("&");
  }

  /**
   * Create a certificate for a domain
   * Will use Route 53 to do the validation
   *
   * @param domain to create the certificate for
   * @param zone
   */
  async doCreateCertificate(domain: string, zone: AWS.Route53.HostedZone) {
    let acm: AWS.ACM = new this.AWS.ACM({
      endpoint: this.resources.endpoints.S3
    });
    if (domain.endsWith(".")) {
      domain = domain.substr(0, domain.length - 1);
    }
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
    let cert: ACM.CertificateDetail = await this.waitFor(
      async resolve => {
        let res = await acm.describeCertificate({ CertificateArn: certificate.CertificateArn }).promise();
        if (res.Certificate.DomainValidationOptions && res.Certificate.DomainValidationOptions[0].ResourceRecord) {
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
      throw new WebdaError("ACM_VALIDATION_FAILED", "Certificate validation has failed");
    }
    if (cert.Status === "PENDING_VALIDATION") {
      // On create need to wait
      let record = cert.DomainValidationOptions[0].ResourceRecord;
      this.logger.log("INFO", "Need to validate certificate", cert.CertificateArn);
      await this.createDNSEntry(record.Name, "CNAME", record.Value, zone);
      // Waiting for certificate validation
      cert = await this.waitFor(
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
    return cert;
  }

  /**
   *
   * @param callback
   * @param delay
   * @param retries
   * @param title
   */
  async waitFor(callback, delay: number, retries: number, title: string): Promise<any> {
    return new Promise(async (mainResolve, mainReject) => {
      let tries: number = 0;
      let uuid = uuidv4();
      this.logger.logProgressStart(uuid, retries, title);
      while (retries > tries++) {
        if (title) {
          this.logger.log("DEBUG", "[" + tries + "/" + retries + "]", title);
        }
        this.logger.logProgressUpdate(tries, uuid);
        if (await callback(mainResolve, mainReject)) {
          this.logger.logProgressUpdate(retries);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      mainReject("Timeout while waiting for " + title);
    });
  }

  /**
   * Create DNS entry
   *
   * @param domain to create
   * @param type of DNS
   * @param value the value of the record
   * @param targetZone
   */
  protected async createDNSEntry(
    domain: string,
    type: string,
    value: string,
    targetZone: AWS.Route53.HostedZone = undefined
  ): Promise<void> {
    this.logger.log("INFO", `Creating DNS entry ${domain} ${type} ${value}`);
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
  async getPolicyDocument(additionalStatements: any[] = []) {
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
      Statement: [...statements, ...additionalStatements]
    };
    return IamPolicyOptimizer.reducePolicyObject(policyDocument);
  }

  /**
   * Create a bucket if it does not exist
   *
   * @param bucket to create
   */
  async createBucket(Bucket: string) {
    let s3 = new this.AWS.S3({
      endpoint: this.resources.endpoints.S3,
      s3ForcePathStyle: this.resources.endpoints.S3 !== undefined
    });
    try {
      await s3
        .headBucket({
          Bucket
        })
        .promise();
    } catch (err) {
      if (err.code === "Forbidden") {
        this.logger.log("ERROR", "S3 bucket already exists in another account or you do not have permissions on it");
      } else if (err.code === "NotFound") {
        this.logger.log("INFO", "\tCreating S3 Bucket", Bucket);
        // Setup www permission on it
        await s3
          .createBucket({
            Bucket: Bucket
          })
          .promise();
        let Tags = this.getDefaultTags([]);
        if (Tags.length) {
          await s3
            .putBucketTagging({
              Bucket,
              Tagging: {
                TagSet: Tags
              }
            })
            .promise();
        }
      }
    }
  }

  /**
   * Send a full folder on bucket
   *
   * @param bucket to send data to
   * @param folder to send
   * @param prefix prefix on the bucket
   */
  async putFolderOnBucket(bucket: string, folder: string, prefix: string = "") {
    let absFolder = path.resolve(folder);
    let files = glob.sync(`${absFolder}/**/*`);
    await this.putFilesOnBucket(
      bucket,
      files.map(f => ({ key: `${prefix}${path.relative(absFolder, f)}`, src: f }))
    );
  }

  /**
   *
   * @param str1 to compare
   * @param str2 to compare
   */
  commonPrefix(str1, str2) {
    let res = "";
    let i = 0;
    while (i <= str1.length && i <= str2.length && str1[i] === str2[i]) {
      res += str1[i];
      i++;
    }
    return res;
  }

  /**
   *
   * @param bucket to send bucket
   * @param files to send
   */
  async putFilesOnBucket(bucket: string, files: { key?: string; src: any; mimetype?: string }[]) {
    let s3 = new this.AWS.S3({
      endpoint: this.resources.endpoints.S3,
      s3ForcePathStyle: this.resources.endpoints.S3 !== undefined
    });
    if (!files.length) {
      return;
    }
    // Create the bucket
    await this.createBucket(bucket);
    files.forEach(f => {
      if (f.src === undefined) {
        throw Error("Should have src and key defined");
      } else if (!f.key) {
        f.key = path.relative(process.cwd(), f.src);
      }
    });
    // Retrieve current files to only upload the one we do not have
    let currentFiles = {};
    let Prefix = files.reduce((prev, cur) => this.commonPrefix(prev, cur.key), files[0].key);
    let Params = {
      Bucket: bucket,
      Prefix,
      MaxKeys: 1000,
      ContinuationToken: undefined
    };
    do {
      let res = await s3.listObjectsV2(Params).promise();
      res.Contents.forEach(obj => {
        currentFiles[obj.Key] = obj;
      });
      Params.ContinuationToken = res.NextContinuationToken;
    } while (Params.ContinuationToken);
    // Should implement multithread here - cleaning too
    let uuid = uuidv4();
    let fullSize = 0;
    files = files.filter(info => {
      if (typeof info.src === "string") {
        let s3obj = currentFiles[info.key];
        let stat = fs.statSync(info.src);
        if (s3obj && stat.size === s3obj.Size) {
          let md5 = `"${this.hash(fs.readFileSync(info.src).toString(), "md5", "hex")}"`;
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
        let mimetype = info.mimetype || mime.contentType(path.extname(info.key)) || "application/octet-stream";
        // use of upload and get size length
        await s3
          .putObject({
            Bucket: bucket,
            Body: typeof info.src === "string" ? fs.createReadStream(info.src) : info.src,
            Key: info.key,
            ContentType: mimetype,
            Tagging: this.getDefaultTagsAsS3Tagging()
          })
          .promise();
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
