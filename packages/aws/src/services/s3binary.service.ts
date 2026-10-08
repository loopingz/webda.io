// Load the AWS SDK for Node.js
import { GetObjectCommand, HeadObjectCommandOutput, PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BinaryFile,
  BinaryFileInfo,
  BinaryMap,
  CloudBinary,
  CloudBinaryParameters,
  CoreModel,
  OperationContext,
  useModelId,
  WebdaError
} from "@webda/core";
import { Readable } from "node:stream";
import { AWSServiceParameters, loadAWSParameters } from "./aws-parameters.js";
import type { CloudFormationContributor, CloudFormationDeployerInfo } from "./contributors.js";

/**
 * S3Binary parameters
 */
export class S3BinaryParameters extends CloudBinaryParameters implements AWSServiceParameters {
  /**
   * Custom endpoint (localstack, minio, ...)
   */
  endpoint?: string;
  /**
   * Static credentials, default to the AWS environment variables
   */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /**
   * AWS region
   * @default "us-east-1"
   */
  region?: string;

  /**
   * Use path style url (required by localstack/minio)
   * @default false
   */
  forcePathStyle?: boolean;
  /**
   * Bucket to store the binaries in
   */
  bucket: string;
  /**
   * CloudFormation customization
   */
  CloudFormation?: any;
  /**
   * Skip CloudFormation on deploy
   */
  CloudFormationSkip?: boolean;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    if (!this.bucket) {
      throw new WebdaError.CodeError("S3BUCKET_PARAMETER_REQUIRED", "Need to define a bucket at least");
    }
    this.forcePathStyle ??= false;
    return this;
  }
}

/**
 * S3Binary handles the storage of binary on a S3 bucket
 *
 * The structure used for now is
 * /{hash}/data
 * /{hash}/{targetStore}_{uuid}
 * The challenge is stored on the metadata of the data object
 *
 * It takes parameters
 *  bucket: "bucketName"
 *  accessKeyId: ""
 *  secretAccessKey: ""
 *  region: ""
 *
 * See Binary the general interface
 *
 * We can register on S3 Event to get info when /data is pushed
 *
 * @WebdaModda
 */
export class S3Binary<T extends S3BinaryParameters = S3BinaryParameters>
  extends CloudBinary<T>
  implements CloudFormationContributor
{
  _s3: S3;

  /**
   * Create the S3 client
   * @override
   */
  computeParameters() {
    super.computeParameters();
    this._s3 = new S3(this.parameters);
  }

  /**
   * Return a signed PUT url if the binary is not yet stored
   *
   * @param object - the model owning the binary
   * @param property - the binary attribute
   * @param body - the binary information (hash and challenge)
   * @param context - the operation context
   * @returns the url to upload to, or undefined if the binary is already stored
   */
  async putRedirectUrl(
    object: CoreModel,
    property: string,
    body?: BinaryFileInfo,
    context?: OperationContext<BinaryFileInfo>
  ): Promise<{ url: string; method: string; headers: { [key: string]: string } }> {
    body ??= await context.getInput();
    const uuid = object.getUUID();
    const store = useModelId(object.constructor);
    const base64String = Buffer.from(body.hash, "hex").toString("base64");
    const params = {
      Bucket: this.parameters.bucket,
      Key: this._getKey(body.hash),
      ContentType: "application/octet-stream",
      ContentMD5: base64String
    };
    // List bucket
    const data = await this._s3.listObjectsV2({
      Bucket: this.parameters.bucket,
      Prefix: this._getKey(body.hash, "")
    });
    let foundMap = false;
    let foundData = false;
    let challenge;
    for (const i in data.Contents) {
      if (data.Contents[i].Key.endsWith("data")) foundData = true;
      if (data.Contents[i].Key.endsWith(`${property}_${uuid}`)) foundMap = true;
      if (data.Contents[i].Key.split("/").pop().startsWith("challenge_")) {
        challenge = data.Contents[i].Key.split("/").pop().substring("challenge_".length);
      }
    }
    const headers = {
      "Content-MD5": base64String,
      "Content-Type": "application/octet-stream"
    };
    if (foundMap) {
      if (foundData) return;
      return {
        url: await this.getSignedUrl(params.Key, "putObject", params),
        method: "PUT",
        headers
      };
    }
    const upload = async () => ({
      url: await this.getSignedUrl(params.Key, "putObject", params),
      method: "PUT",
      headers
    });
    if (foundData) {
      // The data exists: attaching it needs the proof of possession, the challenge its uploader stored
      if (challenge !== undefined && challenge === body.challenge) {
        await this.uploadSuccess(<any>object, property, body);
        await this.putMarker(body.hash, `${property}_${uuid}`, store);
        return;
      }
      // A hash alone never attaches: the client has to upload the content it claims to hold
      return upload();
    }
    // New content: the signed PUT binds the bytes to the announced hash (Content-MD5)
    await this.putMarker(body.hash, `challenge_${body.challenge}`, "challenge");
    await this.uploadSuccess(<any>object, property, body);
    await this.putMarker(body.hash, `${property}_${uuid}`, store);
    return upload();
  }

  /**
   * Put an empty marker object next to the binary data
   * @param hash - the binary hash
   * @param suffix - the marker name
   * @param storeName - the model identifier using the binary
   * @returns the putObject result
   */
  putMarker(hash: string, suffix: string, storeName: string) {
    const s3obj = new S3(this.parameters);
    return s3obj.putObject({
      Bucket: this.parameters.bucket,
      Key: this._getKey(hash, suffix),
      Metadata: {
        "x-amz-meta-store": storeName
      }
    });
  }

  /**
   * Return a signed url to an object
   *
   * @param key to the object
   * @param action to perform
   * @param params - additional command parameters
   * @returns the signed url
   */
  async getSignedUrl(key: string, action: "getObject" | "putObject" = "getObject", params: any = {}): Promise<string> {
    params.Bucket = params.Bucket || this.parameters.bucket;
    params.Key = key;
    let command;
    if (action === "getObject") {
      command = new GetObjectCommand(params);
    } else if (action === "putObject") {
      command = new PutObjectCommand(params);
    }
    // Create new client as the implementation is an ugly middleware
    return getSignedUrl(new S3(this.parameters), command, params);
  }

  /**
   * @override
   * @param binaryMap - the binary to download
   * @param expire - url validity in seconds
   * @param _context - the operation context
   * @returns the signed url
   */
  async getSignedUrlFromMap(binaryMap: BinaryMap, expire: number, _context: OperationContext) {
    const params: any = {};
    params.Expires = expire; // A get should not take more than 30s
    params.ResponseContentDisposition = `attachment; filename=${binaryMap.name || binaryMap.originalname}`;
    params.ResponseContentType = binaryMap.mimetype;

    // Access-Control-Allow-Origin
    return this.getSignedUrl(this._getKey(binaryMap.hash), "getObject", params);
  }

  /**
   * @override
   * @param info - the binary to retrieve
   * @returns the binary content stream
   */
  async _get(info: BinaryMap): Promise<Readable> {
    return <Readable>(
      await this._s3.getObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(info.hash)
      })
    ).Body;
  }

  /**
   * Check if an object exists on S3
   * @param Key - the object key
   * @param Bucket - the bucket, default to the configured one
   * @returns the head result or null if not found
   */
  async exists(Key: string, Bucket: string = this.parameters.bucket): Promise<HeadObjectCommandOutput | null> {
    try {
      return await this._s3.headObject({
        Bucket,
        Key
      });
    } catch (err) {
      if (err.name === "NotFound") {
        return null;
      }
      throw err;
    }
  }

  /**
   * @override
   * @param hash - the binary hash
   * @returns the number of objects using the binary
   */
  async getUsageCount(hash: string): Promise<number> {
    // Not efficient if more than 1000 docs
    const data = await this._s3.listObjects({
      Bucket: this.parameters.bucket,
      Prefix: this._getKey(hash, "")
    });
    data.Contents ??= [];
    return data.Contents.filter(k => !(k.Key.includes("data") || k.Key.includes("challenge"))).length;
  }

  /**
   * Delete the binary data and all its markers
   * @param hash - the binary hash
   */
  async _cleanHash(hash: string): Promise<void> {
    const files = [
      ...((
        await this._s3.listObjectsV2({
          Bucket: this.parameters.bucket,
          Prefix: this._getKey(hash, "")
        })
      ).Contents ?? [])
    ];
    // Delete with a concurrency of 5
    while (files.length) {
      await Promise.all(
        files.splice(0, 5).map(file =>
          this._s3.deleteObject({
            Bucket: this.parameters.bucket,
            Key: file.Key
          })
        )
      );
    }
  }

  /**
   * @override
   * @param hash - the binary hash
   * @param uuid - the object uuid
   * @param attribute - the binary attribute, if undefined clean the whole binary
   */
  async _cleanUsage(hash: string, uuid: string, attribute?: string) {
    if (!attribute) {
      return this._cleanHash(hash);
    }
    // Dont clean data for now
    const params = {
      Bucket: this.parameters.bucket,
      Key: this._getKey(hash, `${attribute}_${uuid}`)
    };
    await this._s3.deleteObject(params);
  }

  /**
   * Check if the binary data exists
   * @param hash - the binary hash
   * @returns true if it exists
   */
  async _exists(hash: string): Promise<boolean> {
    try {
      await this._s3.headObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(hash)
      });
      return true;
    } catch (err) {
      if (err.name !== "NotFound") {
        throw err;
      }
    }
    return false;
  }

  /**
   * Get a head object
   * @param hash - the binary hash
   * @returns the head result or undefined if not found
   */
  async _getS3(hash: string) {
    try {
      return await this._s3.headObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(hash)
      });
    } catch (err) {
      if (err.name !== "NotFound") {
        throw err;
      }
    }
  }

  /**
   * Get an object from s3 bucket
   *
   * @param key to get
   * @param bucket to retrieve from or default bucket
   * @returns the object content stream
   */
  async getObject(key: string, bucket?: string): Promise<Readable> {
    bucket = bucket || this.parameters.bucket;
    const s3obj = new S3(this.parameters);
    return (
      await s3obj.getObject({
        Bucket: bucket,
        Key: key
      })
    ).Body as Readable;
  }

  /**
   *
   * Iterate over the files of a bucket
   *
   * @param Bucket to iterate on
   * @param callback to execute with each key
   * @param Prefix to use
   * @param filter regexp to execute on the key
   */
  async forEachFile(
    Bucket: string,
    callback: (Key: string, page: number) => Promise<void>,
    Prefix: string = "",
    filter: RegExp = undefined
  ) {
    const params: any = { Bucket, Prefix };
    let page = 0;
    const s3 = new S3(this.parameters);
    do {
      await s3.listObjectsV2(params).then(async ({ Contents, NextContinuationToken }: any) => {
        params.ContinuationToken = NextContinuationToken;
        for (const f in Contents) {
          const { Key } = Contents[f];
          if (filter && filter.exec(Key) === null) {
            continue;
          }
          await callback(Key, page);
        }
      });
      page++;
    } while (params.ContinuationToken);
  }

  /**
   * Add an object to S3 bucket
   *
   * @param key to add to
   * @param body content of the object
   * @param metadatas to put along the object
   * @param bucket to use
   */
  async putObject(
    key: string,
    body: Buffer | Blob | string | ReadableStream,
    metadatas = {},
    bucket: string = this.parameters.bucket
  ) {
    const s3obj = new S3(this.parameters);
    await s3obj.putObject({
      Bucket: bucket,
      Key: key,
      Metadata: metadatas,
      Body: body
    });
  }

  /**
   * @override
   * @param object - the model owning the binary
   * @param property - the binary attribute
   * @param file - the binary to store
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<void> {
    this.checkMap(<any>object, property);
    await file.getHashes();
    const data = await this._getS3(file.hash);
    if (data === undefined) {
      const s3metas: any = {};
      s3metas["x-amz-meta-challenge"] = file.challenge;
      const s3obj = new S3(this.parameters);
      await s3obj.putObject({
        Bucket: this.parameters.bucket,
        Key: this._getKey(file.hash),
        Metadata: s3metas,
        Body: await file.get(),
        ContentLength: file.size
      });
    }
    // Set challenge aside for now
    await this.putMarker(file.hash, `challenge_${file.challenge}`, "challenge");

    await this.putMarker(file.hash, `${property}_${object.getUUID()}`, useModelId(object.constructor));
    await this.uploadSuccess(<any>object, property, file.toBinaryFileInfo());
  }

  /**
   * IAM policy required by the service
   * @param _accountId - AWS account id
   * @returns the policy statement
   */
  getARNPolicy(_accountId: string) {
    return {
      Sid: this.constructor.name + this.getName(),
      Effect: "Allow",
      Action: [
        "s3:AbortMultipartUpload",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:GetObject",
        "s3:GetObjectAcl",
        "s3:GetObjectTagging",
        "s3:GetObjectTorrent",
        "s3:GetObjectVersion",
        "s3:GetObjectVersionAcl",
        "s3:GetObjectVersionTagging",
        "s3:GetObjectVersionTorrent",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads",
        "s3:ListBucketVersions",
        "s3:ListMultipartUploadParts",
        "s3:PutBucketAcl",
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:RestoreObject"
      ],
      Resource: [`arn:aws:s3:::${this.parameters.bucket}`, `arn:aws:s3:::${this.parameters.bucket}/*`]
    };
  }

  /**
   * CloudFormation resources for the bucket
   * @param deployer - the deployer requesting the resources
   * @returns the resources
   */
  getCloudFormation(deployer: CloudFormationDeployerInfo) {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    const resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    this.parameters.CloudFormation.Bucket = this.parameters.CloudFormation.Bucket || {};
    resources[this.getName() + "Bucket"] = {
      Type: "AWS::S3::Bucket",
      Properties: {
        ...this.parameters.CloudFormation.Bucket,
        BucketName: this.parameters.bucket,
        Tags: deployer.getDefaultTags(this.parameters.CloudFormation.Bucket.Tags)
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }
}

export default S3Binary;
