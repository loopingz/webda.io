import { ACM, CertificateDetail, ListCertificatesResponse, RequestCertificateCommandInput } from "@aws-sdk/client-acm";
import { EC2 } from "@aws-sdk/client-ec2";
import { HostedZone, RRType, Route53 } from "@aws-sdk/client-route-53";
import { NotFound, S3 } from "@aws-sdk/client-s3";
import { GetCallerIdentityResponse, STS } from "@aws-sdk/client-sts";
import {
  getDeploymentVariables,
  InstanceCache,
  resolveDeploymentVariables,
  Service,
  ServiceParameters,
  useCore,
  WebdaError
} from "@webda/core";
import { WaitFor, WaitLinearDelay } from "@webda/utils";
import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import IamPolicyOptimizer from "iam-policy-optimizer";
import * as mime from "mime-types";
import type { IAMPolicyContributor } from "../services/contributors.js";
import { Route53Service } from "../services/route53.service.js";

/**
 * Tags as an AWS array or as a map
 */
export type TagsDefinition = { Key: string; Value: string }[] | { [key: string]: string };

/**
 * AWS clients a deployer can target with a custom endpoint
 */
export type AWSDeployerEndpoint =
  "ACM" | "S3" | "STS" | "EC2" | "Route53" | "CloudFormation" | "APIGateway" | "CloudFront";

/**
 * Common parameters of the AWS deployers
 *
 * A deployer is declared as a unit of a deployment (`deployments/<name>.json`),
 * its parameters can use the `${...}` deployment variables ({@link getDeploymentVariables})
 */
export class AWSDeployerParameters extends ServiceParameters {
  /**
   * Name of the unit
   */
  name?: string;
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
   * AWS_SESSION_TOKEN Token
   *
   * Even if it is possible to add it here
   * It is not sustainable as this token at its best will
   * have a lifetime of 12 hours
   */
  sessionToken?: string;
  /**
   * AWS_REGION to use
   *
   * @default "us-east-1"
   */
  region?: string;
  /**
   * AWS Account Id
   */
  AWSAccountId?: string;
  /**
   * Endpoints to use by differents services
   * Usefull to test with localstack or other AWS emulations
   */
  endpoints?: { [key in AWSDeployerEndpoint]?: string };
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
      [key: string]: any;
    };
  };
}

/**
 * Plain resources of a deployer: its parameters with the deployment variables replaced
 */
export type DeployerResources<T> = Omit<T, "load" | "update" | "with" | "watch">;

/**
 * Abstract AWS Deployer
 *
 * It includes some basic utilities methods to be used by
 * final deployers. A final deployer declares `implements Deployer` itself.
 */
export abstract class AWSDeployer<T extends AWSDeployerParameters = AWSDeployerParameters> extends Service<T> {
  /**
   * Parameters of the deployer with the deployment variables replaced and the defaults applied
   *
   * Computed by {@link AWSDeployer.prepare}
   */
  resources: DeployerResources<T> & { [key: string]: any };

  /**
   * Compute the resources from the parameters
   *
   * @param extra - additional deployment variables
   * @returns the resources
   */
  async prepare(extra: Record<string, any> = {}): Promise<this["resources"]> {
    this.resources = this.getRawParameters();
    this.resources.name ??= this.getName();
    // Defaults can use the deployment variables too
    await this.defaultResources();
    this.resources = resolveDeploymentVariables(
      this.resources,
      getDeploymentVariables(this, { resources: this.resources, ...extra })
    );
    return this.resources;
  }

  /**
   * Parameters as a plain object
   * @returns a copy of the parameters
   */
  protected getRawParameters(): any {
    const raw = JSON.parse(JSON.stringify(this.getParameters() ?? {}));
    delete raw.watchers;
    return raw;
  }

  /**
   * Apply the default resources
   */
  async defaultResources(): Promise<void> {
    this.resources.accessKeyId ??= process.env["AWS_ACCESS_KEY_ID"];
    this.resources.secretAccessKey ??= process.env["AWS_SECRET_ACCESS_KEY"];
    this.resources.sessionToken ??= process.env["AWS_SESSION_TOKEN"];
    this.resources.region ??= process.env["AWS_DEFAULT_REGION"] || "us-east-1";
    this.resources.endpoints ??= {};
    this.resources.Tags = this.transformMapTagsToArray(this.resources.Tags || {});
  }

  /**
   * Configuration of an AWS client
   *
   * @param endpoint - the client, to use its custom endpoint
   * @param region - force a region
   * @returns the client configuration
   */
  getClientConfig(endpoint?: AWSDeployerEndpoint, region?: string): any {
    const config: any = {
      region: region ?? this.getRegion()
    };
    if (endpoint && this.resources.endpoints?.[endpoint]) {
      config.endpoint = this.resources.endpoints[endpoint];
    }
    if (this.resources.accessKeyId && this.resources.secretAccessKey) {
      config.credentials = {
        accessKeyId: this.resources.accessKeyId,
        secretAccessKey: this.resources.secretAccessKey,
        sessionToken: this.resources.sessionToken
      };
    }
    return config;
  }

  /**
   * Return AWS region
   * @returns the region
   */
  getRegion(): string {
    return this.resources?.region ?? "us-east-1";
  }

  /**
   * Return the current AWS Identity used
   * @returns the identity
   */
  @InstanceCache()
  async getAWSIdentity(): Promise<GetCallerIdentityResponse> {
    const sts = new STS(this.getClientConfig("STS"));
    return sts.getCallerIdentity({});
  }

  /**
   * Return the default VPC for the current region
   * @returns the VPC id and its subnets, undefined if there is no default VPC
   */
  @InstanceCache()
  async getDefaultVpc(): Promise<{ Id: string; Subnets: any[] } | undefined> {
    const defaultVpc = {
      Id: "",
      Subnets: []
    };
    const ec2 = new EC2(this.getClientConfig("EC2"));
    const res = await ec2.describeVpcs({});
    for (const vpc of res.Vpcs ?? []) {
      if (vpc.IsDefault) {
        defaultVpc.Id = vpc.VpcId;
        break;
      }
    }
    if (defaultVpc.Id === "") {
      return undefined;
    }
    const res2 = await ec2.describeSubnets({
      Filters: [
        {
          Name: "vpc-id",
          Values: [defaultVpc.Id]
        }
      ]
    });
    defaultVpc.Subnets.push(...(res2.Subnets ?? []));
    return defaultVpc;
  }

  /**
   * Generate a MD5 in hex
   * @param str - to hash
   * @returns the hash
   */
  protected md5(str: string): string {
    return this.hash(str, "md5", "hex");
  }

  /**
   * Hash the string
   *
   * @param str - to hash
   * @param type - of hash
   * @param format - hex or b64
   * @returns the hash
   */
  protected hash(str: string | Buffer, type: string = "md5", format: "hex" | "base64" = "hex"): string {
    return crypto.createHash(type).update(str).digest(format);
  }

  /**
   * Replace / by _ as theses ID are not allowed in AWS
   *
   * @param id - to replace
   * @returns the AWS compatible id
   */
  _replaceForAWS(id: string): string {
    return id.replace(/\//g, "_");
  }

  /**
   * Get a certificate or create it
   *
   * @param domain - to get certificate for
   * @param region - of the certificate
   * @returns the certificate
   */
  async getCertificate(domain: string, region: string = undefined): Promise<any> {
    if (domain.endsWith(".")) {
      domain = domain.substring(0, domain.length - 1);
    }
    const acm = new ACM(this.getClientConfig("ACM", region));
    const params: any = {};
    let res: ListCertificatesResponse;
    let certificate;
    do {
      res = await acm.listCertificates(params);
      certificate = (res.CertificateSummaryList ?? []).filter(cert => cert.DomainName === domain).pop();
      params.NextToken = res.NextToken;
    } while (!certificate && res.NextToken);
    // We did not find the certificate need to create one
    if (!certificate) {
      const zone = await this.getZoneForDomainName(domain);
      if (!zone) {
        throw new WebdaError.CodeError("ROUTE53_NOTFOUND", "Cannot create certificate as Route53 Zone was not found");
      }
      this.log("INFO", "Creating a certificate for", domain);
      certificate = await this.doCreateCertificate(domain, zone, region);
    }
    return certificate;
  }

  /**
   * Get the closest zone to the domain
   *
   * @param domain - to get zone for
   * @returns the zone
   */
  @InstanceCache()
  async getZoneForDomainName(domain: string): Promise<HostedZone> {
    return Route53Service.getZoneForDomainName(domain);
  }

  /**
   * Transform a tag map into a tag array
   *
   * @param tags - to transform
   * @returns the tags array
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
   * @param tags - to transform
   * @returns the tags map
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
   * @param key - of the resources to add, or the tags themselves
   * @returns the tags array
   */
  getDefaultTags(key: string | TagsDefinition = undefined): { Key: string; Value: string }[] {
    let Tags;
    if (typeof key === "string") {
      Tags = this.resources[key] ? this.transformMapTagsToArray(this.resources[key].Tags || []) : [];
    } else {
      Tags = this.transformMapTagsToArray(key || []);
    }
    const defaults = <{ Key: string; Value: string }[]>this.resources.Tags || [];
    if (defaults.length) {
      const TagKeys = Tags.map(t => t.Key);
      Tags.push(...defaults.filter(t => TagKeys.indexOf(t.Key) < 0));
    }
    return Tags;
  }

  /**
   * Take this.resources[key].Tags and add all remaining Tags from this.resources.Tags
   *
   * @param key - of the resources to add
   * @returns the tags map
   */
  getDefaultTagsAsMap(key: string | TagsDefinition = undefined): {
    [key: string]: string;
  } {
    return this.transformArrayTagsToMap(this.getDefaultTags(key));
  }

  /**
   * Return the S3 Tagging string
   * @param key - of the resources to add
   * @returns the url encoded tags
   */
  getDefaultTagsAsS3Tagging(key: string | TagsDefinition = undefined): string {
    return this.getDefaultTags(key)
      .map(tag => `${encodeURIComponent(tag.Key)}=${encodeURIComponent(tag.Value)}`)
      .join("&");
  }

  /**
   * Wait for a condition with a linear delay
   *
   * @param callback - resolve when done, return true to stop
   * @param retries - maximum number of tries
   * @param title - of the wait
   * @param delay - between tries in ms
   * @returns the resolved value
   */
  async waitFor(
    callback: (resolve?: (value?: any) => void, reject?: (reason?: any) => void) => Promise<boolean>,
    retries: number,
    title: string,
    delay: number
  ): Promise<any> {
    return WaitFor(callback, retries, title, this.logger, WaitLinearDelay(delay));
  }

  /**
   * Create a certificate for a domain
   * Will use Route 53 to do the validation
   *
   * @param domain - to create the certificate for
   * @param zone - to create the validation record in
   * @param region - of the certificate
   * @returns the certificate
   */
  async doCreateCertificate(domain: string, zone: HostedZone, region?: string): Promise<CertificateDetail> {
    const acm = new ACM(this.getClientConfig("ACM", region));
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
      this.log("INFO", "Need to validate certificate", cert.CertificateArn);
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
          return false;
        },
        10,
        "Waiting for certificate validation",
        60000
      );
    }
    return cert;
  }

  /**
   * Create DNS entry
   *
   * @param domain - to create
   * @param type - of DNS
   * @param value - the value of the record
   * @param targetZone - the zone, found from the domain if not provided
   */
  public async createDNSEntry(
    domain: string,
    type: RRType,
    value: string,
    targetZone: HostedZone = undefined
  ): Promise<void> {
    this.log("INFO", `Creating DNS entry ${domain} ${type} ${value}`);
    const r53 = new Route53(this.getClientConfig("Route53"));
    if (!domain.endsWith(".")) {
      domain = domain + ".";
    }
    targetZone ??= await this.getZoneForDomainName(domain);
    if (!targetZone) {
      throw new WebdaError.CodeError("ROUTE53_NOTFOUND", "Domain is not handled on AWS");
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

  /**
   * Permissions needed by the deployed application itself
   *
   * @param accountId - the account
   * @param region - the region
   * @returns the policy statements
   */
  getARNPolicy(accountId: string, region: string): any[] {
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
   *
   * @param additionalStatements - statements to add
   * @returns the optimized policy document
   */
  @InstanceCache()
  async getPolicyDocument(additionalStatements: any[] = []): Promise<any> {
    const me = await this.getAWSIdentity();
    const statements = [];
    // Build policy
    for (const service of this.getApplicationServices()) {
      if (typeof (<any>service).getARNPolicy === "function") {
        // Update to match recuring policy - might need to split if policy too big
        const res = (<IAMPolicyContributor>(<any>service)).getARNPolicy(me.Account, this.getRegion());
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
    const optimizer: any = (<any>IamPolicyOptimizer).default ?? IamPolicyOptimizer;
    return optimizer.reducePolicyObject(policyDocument);
  }

  /**
   * Services of the application, the deployers excluded
   *
   * @returns the services
   */
  getApplicationServices(): Service[] {
    return Object.values(useCore()?.getServices() ?? {}).filter(
      service => service && !(service instanceof AWSDeployer)
    ) as Service[];
  }

  /**
   * Create a bucket if it does not exist
   *
   * @param Bucket - to create
   */
  async createBucket(Bucket: string): Promise<void> {
    const s3 = this.getS3();
    try {
      await s3.headBucket({
        Bucket
      });
    } catch (err) {
      if (err.name === "Forbidden") {
        this.log("ERROR", "S3 bucket already exists in another account or you do not have permissions on it");
      } else if (err instanceof NotFound || err.name === "NotFound") {
        this.log("INFO", "\tCreating S3 Bucket", Bucket);
        await s3.createBucket({
          Bucket
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
   * S3 client
   * @returns the client
   */
  protected getS3(): S3 {
    return new S3({
      ...this.getClientConfig("S3"),
      forcePathStyle: this.resources.endpoints?.S3 !== undefined
    });
  }

  /**
   * Send a full folder (recursive) on bucket
   *
   * @param bucket - to send data to
   * @param folder - path to local folder to send
   * @param prefix - prefix on the bucket
   */
  async putFolderOnBucket(bucket: string, folder: string, prefix: string = ""): Promise<void> {
    const absFolder = path.resolve(folder);
    const files = (<string[]>fs.readdirSync(absFolder, { recursive: true }))
      .map(f => path.join(absFolder, f))
      .filter(f => fs.statSync(f).isFile());
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
   * @param str1 - to compare
   * @param str2 - to compare
   * @returns the common prefix
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
   * The files src can be either:
   *  - a string representing the local path
   *  - a Buffer with the dynamic content
   *
   * @param bucket - to send bucket
   * @param files - to send
   */
  async putFilesOnBucket(bucket: string, files: { key?: string; src: any; mimetype?: string }[]): Promise<void> {
    const s3 = this.getS3();
    if (!files.length) {
      return;
    }
    files.forEach(f => {
      if (f.src === undefined) {
        throw new Error("Should have src and key defined");
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
      (res.Contents ?? []).forEach(obj => {
        currentFiles[obj.Key] = obj;
      });
      Params.ContinuationToken = res.NextContinuationToken;
    } while (Params.ContinuationToken);
    files = files.filter(info => {
      if (typeof info.src === "string") {
        const s3obj = currentFiles[info.key];
        const stat = fs.statSync(info.src);
        if (s3obj && stat.size === s3obj.Size) {
          const md5 = `"${this.hash(fs.readFileSync(info.src), "md5", "hex")}"`;
          if (md5 === s3obj.ETag) {
            this.log("TRACE", "Skipping upload of", info.src, "file with same hash already on bucket");
            return false;
          }
        }
      }
      return true;
    });
    const uuid = randomUUID();
    this.logger.logProgressStart(uuid, files.length, "Uploading to S3 bucket " + bucket);
    const Tagging = this.getDefaultTagsAsS3Tagging();
    // Upload 5 files at a time
    for (let i = 0; i < files.length; i += 5) {
      await Promise.all(
        files.slice(i, i + 5).map(async info => {
          // Need to have mimetype to serve the content correctly
          const mimetype = info.mimetype || mime.contentType(path.extname(info.key)) || "application/octet-stream";
          await s3.putObject({
            Bucket: bucket,
            Body: typeof info.src === "string" ? fs.createReadStream(info.src) : info.src,
            Key: info.key,
            ContentType: mimetype,
            Tagging
          });
          this.logger.logProgressIncrement(1, uuid);
          this.log(
            "INFO",
            "Uploaded",
            typeof info.src === "string" ? info.src : "<dynamicContent>",
            "to",
            `s3://${bucket}/${info.key}`,
            "(" + mimetype + ")"
          );
        })
      );
    }
  }
}
