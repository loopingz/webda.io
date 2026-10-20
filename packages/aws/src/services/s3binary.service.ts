// Load the AWS SDK for Node.js
import { GetObjectCommand, HeadObjectCommandOutput, PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BinaryFile,
  BinaryFileInfo,
  BinaryMap,
  CloudBinary,
  CloudBinaryParameters,
  ContentBody,
  ContentCredentialNotFoundError,
  ContentExistsError,
  ContentGetOptions,
  ContentInfo,
  ContentNotFoundError,
  ContentPutOptions,
  CoreModel,
  CoreModelWithBinary,
  lookupMimeType,
  normalizeHash,
  normalizeHashes,
  OperationContext,
  parseContentUrl,
  SecretString,
  toReadable,
  useModelId,
  WebdaError
} from "@webda/core";
import * as crypto from "node:crypto";
import { posix } from "node:path";
import { Readable } from "node:stream";
import { AWSServiceParameters, getAWSClientConfig, loadAWSParameters } from "./aws-parameters.js";
import type { CloudFormationContributor, CloudFormationDeployerInfo } from "./contributors.js";

/**
 * Build an RFC 6266 Content-Disposition header value for a file name
 *
 * The name is sent twice: a quoted ASCII fallback for old clients and an RFC 5987 UTF-8 `filename*`.
 * Quotes, backslashes and non-ASCII characters can neither break nor inject into the header (e.g. l'été "1".png)
 *
 * @param name - the file name
 * @param type - the disposition type
 * @returns the header value
 */
export function contentDisposition(name?: string, type: "attachment" | "inline" = "attachment"): string {
  if (!name) {
    return type;
  }
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  // encodeURIComponent keeps ' ( ) * which are not valid in an RFC 5987 value
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * A direct upload waiting for its completion, as announced by the client
 */
interface PendingUpload {
  name?: string;
  size?: number;
  mimetype?: string;
  challenge?: string;
  metadata?: any;
  /**
   * Creation time in ms
   */
  created?: number;
}

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
   *
   * Can be encrypted with `webda config encrypt`
   */
  credentials?: {
    accessKeyId: string | SecretString;
    secretAccessKey: string | SecretString;
    sessionToken?: string | SecretString;
  };
  /** Named credentials selectable through `?credential=<name>` in content URLs. */
  credentialProfiles?: Record<string, NonNullable<AWSServiceParameters["credentials"]>>;
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
   * Seconds a direct upload stays pending before its marker (and its data, when unused) is swept
   * @default 86400
   */
  pendingTimeout?: number;

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
    this.pendingTimeout ??= 86400;
    if (typeof this.pendingTimeout !== "number" || !(this.pendingTimeout > 0)) {
      throw new WebdaError.CodeError("S3PENDINGTIMEOUT_INVALID", "pendingTimeout must be a positive number of seconds");
    }
    return this;
  }
}

/**
 * S3Binary handles the storage of binary on a S3 bucket
 *
 * The structure used for now is
 * /{hash}/data
 * /{hash}/{attribute}_{uuid} usage markers
 * /{hash}/vproof_{challenge} the proof of possession, written once the service read the bytes
 * /{hash}/proof_{challenge} legacy proof written from a client announced value: ignored
 * /_pending/{hash}/{model}_{attribute}_{uuid} a direct upload waiting for its completion
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
  readonly schemes = ["s3"];
  _s3: S3;
  /**
   * S3 client configuration, with plain credentials
   */
  protected _s3Config: any;
  private contentClients = new Map<string, S3>();

  /**
   * Use this service's region with the URL-selected endpoint and credential profile.
   * @param endpoint - optional URL-selected endpoint
   * @param credential - optional configured credential profile
   * @returns the S3 client
   */
  protected getContentClient(endpoint?: string, credential?: string): S3 {
    if (!endpoint && !credential) {
      return this._s3;
    }
    const cacheKey = JSON.stringify([endpoint, credential]);
    let client = this.contentClients.get(cacheKey);
    if (!client) {
      let credentials = this._s3Config.credentials;
      if (credential) {
        if (!Object.prototype.hasOwnProperty.call(this.parameters.credentialProfiles ?? {}, credential)) {
          throw new ContentCredentialNotFoundError(credential);
        }
        credentials = getAWSClientConfig({ credentials: this.parameters.credentialProfiles![credential] }).credentials;
      }
      client = new S3({
        ...this._s3Config,
        credentials,
        ...(endpoint ? { endpoint, forcePathStyle: true } : {})
      });
      this.contentClients.set(cacheKey, client);
    }
    return client;
  }

  /**
   * Timer sweeping the stale pending uploads
   */
  private sweepTimer?: ReturnType<typeof setInterval>;

  /**
   * Start sweeping the stale pending uploads every `pendingTimeout / 4`
   * @override
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    clearInterval(this.sweepTimer);
    this.sweepTimer = setInterval(
      () => {
        this.sweepPending().catch(err => this.log("WARN", "Cannot sweep pending uploads", err));
      },
      // setInterval delays are 32-bit signed integers
      Math.min((this.parameters.pendingTimeout * 1000) / 4, 2 ** 31 - 1)
    );
    this.sweepTimer.unref?.();
    return this;
  }

  /** Release URL-selected clients when the service stops. */
  async stop(): Promise<void> {
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
    for (const client of this.contentClients.values()) {
      client.destroy();
    }
    this.contentClients.clear();
    await super.stop();
  }

  /**
   * Create the S3 client
   * @override
   */
  computeParameters() {
    super.computeParameters();
    this._s3Config = getAWSClientConfig(this.parameters);
    this._s3 = new S3(this._s3Config);
  }

  /**
   * Get content read stream from S3
   * @param url - s3://bucket/key or s3:///key
   * @param options - range options
   * @returns Readable stream
   */
  async getContent(url: string, options?: ContentGetOptions): Promise<Readable> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    const client = this.getContentClient(endpoint, credential);
    const params: any = {
      Bucket: targetBucket,
      Key: key
    };
    if (options?.range) {
      const start = options.range.start;
      const end = options.range.end !== undefined ? options.range.end : "";
      params.Range = `bytes=${start}-${end}`;
    }
    try {
      const res = await client.send(new GetObjectCommand(params));
      if (this.metrics && (this.metrics as any).download) {
        (this.metrics as any).download.inc();
      }
      return res.Body as Readable;
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.Code === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        throw new ContentNotFoundError(`Content not found: ${url}`);
      }
      throw err;
    }
  }

  /**
   * Put content to S3 using streaming multipart Upload
   * @param url - s3://bucket/key or s3:///key
   * @param body - readable stream, buffer, or string
   * @param options - write options
   * @returns ContentInfo
   */
  async putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    const client = this.getContentClient(endpoint, credential);

    if (options?.ifNotExists) {
      const existing = await client.headObject({ Bucket: targetBucket, Key: key }).then(
        () => true,
        (err: any) => {
          if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404)
            return false;
          throw err;
        }
      );
      if (existing) {
        throw new ContentExistsError(`Content already exists: ${url}`);
      }
    }

    const contentType = options?.contentType || lookupMimeType(key);
    const uploadParams: any = {
      Bucket: targetBucket,
      Key: key,
      Body: toReadable(body),
      ContentType: contentType,
      Metadata: options?.metadata
    };
    if (options?.ifNotExists) {
      uploadParams.IfNoneMatch = "*";
    }

    const upload = new Upload({
      client,
      params: uploadParams
    });

    try {
      const res = await upload.done();
      if (this.metrics && (this.metrics as any).upload) {
        (this.metrics as any).upload.inc();
      }
      let size = options?.contentLength;
      let etag = res.ETag;
      let lastModified: Date | undefined;
      if (size === undefined) {
        try {
          const head = await client.headObject({ Bucket: targetBucket, Key: key });
          size = head.ContentLength;
          etag = head.ETag || etag;
          lastModified = head.LastModified;
        } catch {}
      }
      return {
        url,
        size,
        etag,
        contentType,
        metadata: options?.metadata,
        lastModified
      };
    } catch (err: any) {
      if (
        err.name === "PreconditionFailed" ||
        err.Code === "PreconditionFailed" ||
        err.$metadata?.httpStatusCode === 412
      ) {
        throw new ContentExistsError(`Content already exists: ${url}`);
      }
      throw err;
    }
  }

  /**
   * Head content metadata from S3
   * @param url - s3://bucket/key or s3:///key
   * @returns ContentInfo or undefined if not found
   */
  async headContent(url: string): Promise<ContentInfo | undefined> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    try {
      const res = await this.getContentClient(endpoint, credential).headObject({
        Bucket: targetBucket,
        Key: key
      });
      return {
        url,
        size: res.ContentLength,
        etag: res.ETag,
        contentType: res.ContentType,
        metadata: res.Metadata,
        lastModified: res.LastModified
      };
    } catch (err: any) {
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Delete content from S3
   * @param url - s3://bucket/key or s3:///key
   */
  async deleteContent(url: string): Promise<void> {
    const { bucket, key, endpoint, credential } = parseContentUrl(url, this.parameters.bucket);
    const targetBucket = bucket!;
    await this.getContentClient(endpoint, credential).deleteObject({
      Bucket: targetBucket,
      Key: key
    });
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
    // One key per content: the hash and the challenge are lower-case hexadecimal
    body = normalizeHashes(body);
    // The hash names S3 keys: hexadecimal only (no path segments)
    this.checkHash(body?.hash);
    const uuid = object.getUUID();
    const store = useModelId(object.constructor);
    const base64String = Buffer.from(body.hash, "hex").toString("base64");
    const params: Record<string, any> = {
      Bucket: this.parameters.bucket,
      Key: this._getKey(body.hash),
      ContentType: "application/octet-stream",
      ContentMD5: base64String
    };
    // The declared size is signed: S3 refuses another Content-Length (browsers set the header themselves)
    if (typeof body.size === "number") {
      params.ContentLength = body.size;
    }
    // List bucket
    const data = await this._s3.listObjectsV2({
      Bucket: this.parameters.bucket,
      Prefix: this._getKey(body.hash, "")
    });
    let foundData = false;
    // The proofs the service wrote once it read the bytes (`vproof_<challenge>`). Legacy `proof_` and `challenge_`
    // keys were written from client announced values: they are no proof
    const proofs = new Set<string>();
    for (const i in data.Contents) {
      const name = data.Contents[i].Key.split("/").pop();
      if (name === "data") foundData = true;
      if (name.startsWith(S3Binary.PROOF_PREFIX)) {
        proofs.add(name.substring(S3Binary.PROOF_PREFIX.length));
      }
    }
    const headers = {
      "Content-MD5": base64String,
      "Content-Type": "application/octet-stream"
    };
    const upload = async () => ({
      url: await this.getSignedUrl(params.Key, "putObject", params),
      method: "PUT",
      headers
    });
    if (foundData && this.isLinked(<any>object, property, body.hash)) {
      return;
    }
    if (foundData && typeof body.challenge === "string" && proofs.has(body.challenge)) {
      // The data exists and the client proves possession with the challenge of the verified content
      const head = await this._getS3(body.hash);
      if (head) {
        const max = this.parameters.maxUploadSize;
        if (max !== undefined && head.ContentLength > max) {
          throw new WebdaError.BadRequest("File too big");
        }
        // The stored object's size, not the declared one
        await this.uploadSuccess(<any>object, property, {
          hash: body.hash,
          size: head.ContentLength,
          name: body.name,
          mimetype: body.mimetype || "application/octet-stream",
          metadata: body.metadata ?? {}
        });
        await this.putMarker(body.hash, `${property}_${uuid}`, store);
        return;
      }
    }
    // New content, or existing data without a matching proof (a hash alone never attaches): the signed PUT binds the
    // bytes to the announced hash (Content-MD5). Nothing is attached until the client declares the upload complete
    // and the stored bytes are verified against the announced hash and challenge (completeUpload)
    await this.putPendingMarker(object, property, body);
    return upload();
  }

  /**
   * Reject a hash that is not hexadecimal: it names S3 keys
   * @param hash - the binary hash
   */
  protected checkHash(hash: string): void {
    if (typeof hash !== "string" || !/^[0-9a-f]+$/.test(hash)) {
      throw new WebdaError.BadRequest("Invalid hash");
    }
  }

  /**
   * Encode a pending marker part: injective and key-safe. Bytes outside `[A-Za-z0-9.:@-]` (so `_`, `/` and `~`
   * too) become `~XX`, so `_` only separates parts and no `%` reaches the key (content urls decode it)
   * @param part - the raw value
   * @returns the encoded part
   */
  protected encodeMarkerPart(part: string): string {
    return [...Buffer.from(`${part}`)]
      .map(b => {
        const c = String.fromCharCode(b);
        return /[A-Za-z0-9.:@-]/.test(c) ? c : `~${b.toString(16).toUpperCase().padStart(2, "0")}`;
      })
      .join("");
  }

  /**
   * Key of the pending upload of an object attribute: `<prefix>/_pending/<hash>/<model>_<attribute>_<uuid>`, each
   * part encoded so that `_` only separates parts
   * @param object - the model owning the binary
   * @param property - the binary attribute
   * @param hash - the binary hash (hexadecimal)
   * @returns the key
   */
  protected getPendingKey(object: CoreModel, property: string, hash: string): string {
    const marker = [useModelId(object.constructor), property, object.getUUID()]
      .map(p => this.encodeMarkerPart(p))
      .join("_");
    return posix.join(this.parameters.prefix || "", "_pending", hash, marker);
  }

  /**
   * Record a direct upload waiting for its completion: the announced information is the marker's JSON body, server
   * side only (the challenge is never persisted on the object nor returned to clients)
   * @param object - the model owning the binary
   * @param property - the binary attribute
   * @param body - the announced binary information
   */
  protected async putPendingMarker(object: CoreModel, property: string, body: BinaryFileInfo): Promise<void> {
    const info: PendingUpload = {
      name: body.name,
      size: typeof body.size === "number" ? body.size : undefined,
      mimetype: body.mimetype,
      challenge: body.challenge,
      metadata: body.metadata,
      created: Date.now()
    };
    await this._s3.putObject({
      Bucket: this.parameters.bucket,
      Key: this.getPendingKey(object, property, body.hash),
      ContentType: "application/json",
      Body: JSON.stringify(info)
    });
  }

  /**
   * Read a pending upload marker
   * @param key - the marker key
   * @returns its information, undefined when absent, `{}` when unreadable
   */
  protected async getPendingUpload(key: string): Promise<PendingUpload | undefined> {
    let stream: Readable;
    try {
      stream = await this.getContent(this.getContentUrl(key));
    } catch (err) {
      if (err instanceof ContentNotFoundError) {
        return undefined;
      }
      throw err;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString()) ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Hash the stored data the way clients do: md5 of the bytes, and md5 of "WEBDA" + the bytes (the challenge)
   * @param hash - the binary hash
   * @returns the computed hash and challenge
   */
  protected async hashStoredData(hash: string): Promise<{ hash: string; challenge: string }> {
    const md5 = crypto.createHash("md5");
    const challenge = crypto.createHash("md5").update("WEBDA");
    for await (const chunk of await this.getContent(this.getContentUrl(this._getKey(hash)))) {
      const buffer = Buffer.from(chunk);
      md5.update(buffer);
      challenge.update(buffer);
    }
    return { hash: md5.digest("hex"), challenge: challenge.digest("hex") };
  }

  /**
   * Attach a direct upload once the client declares it finished
   *
   * The pending marker written by the challenge is required (404 otherwise) and the data object must exist (412
   * otherwise, the marker stays so the client can retry). The data must match the declared size and
   * `maxUploadSize`, and its bytes the announced hash and challenge (the proof of possession, computed here from the
   * stored bytes): otherwise 400, the marker and the unused data are removed. Then the proof of possession (server
   * computed) and the usage marker are written and the binary is attached.
   *
   * @override
   * @param object - the model owning the binary
   * @param property - the binary attribute
   * @param hash - the hash announced in the challenge
   */
  async completeUpload(object: CoreModelWithBinary, property: string, hash: string): Promise<void> {
    hash = normalizeHash(hash);
    if (this.isLinked(object, property, hash)) {
      return;
    }
    this.checkHash(hash);
    const pendingKey = this.getPendingKey(<any>object, property, hash);
    const pending = await this.getPendingUpload(pendingKey);
    if (!pending) {
      throw new WebdaError.NotFound("No pending upload");
    }
    const data = await this._getS3(hash);
    if (!data) {
      throw new WebdaError.PreconditionFailed("Upload not found");
    }
    const reject = async (message: string) => {
      await this._s3.deleteObject({ Bucket: this.parameters.bucket, Key: pendingKey });
      await this.deleteUnusedData(hash);
      throw new WebdaError.BadRequest(message);
    };
    const max = this.parameters.maxUploadSize;
    if (
      (typeof pending.size === "number" && data.ContentLength !== pending.size) ||
      (max !== undefined && data.ContentLength > max)
    ) {
      await reject("Uploaded size does not match");
    }
    if (typeof pending.challenge !== "string" || pending.challenge === "") {
      await reject("No challenge announced");
    }
    const computed = await this.hashStoredData(hash);
    if (computed.hash !== hash || computed.challenge !== normalizeHash(pending.challenge)) {
      await reject("Uploaded content does not match the challenge");
    }
    await this.putMarker(hash, this.proofMarker(computed.challenge), "proof");
    await this.putMarker(hash, `${property}_${object.getUUID()}`, useModelId(object.constructor));
    // uploadSuccess re-loads the object: a concurrent completion that linked the hash meanwhile is not repeated
    await this.uploadSuccess(object, property, {
      hash,
      challenge: computed.challenge,
      size: data.ContentLength,
      name: pending.name,
      mimetype: pending.mimetype || "application/octet-stream",
      metadata: pending.metadata ?? {}
    });
    await this._s3.deleteObject({ Bucket: this.parameters.bucket, Key: pendingKey });
  }

  /**
   * Prefix of the proof markers written by the service from the bytes it read (`vproof_<challenge>`)
   */
  static readonly PROOF_PREFIX = "vproof_";

  /**
   * Name of the proof marker of a challenge computed by the service
   * @param challenge - the server computed challenge
   * @returns the marker name
   */
  protected proofMarker(challenge: string): string {
    return `${S3Binary.PROOF_PREFIX}${challenge}`;
  }

  /**
   * Whether a key under `<hash>/` is a usage marker: not the data, nor a proof (verified or legacy)
   * @param key - the object key
   * @returns true for a usage marker
   */
  protected isUsageMarker(key: string): boolean {
    const name = key.split("/").pop();
    return !(
      name === "data" ||
      name.startsWith(S3Binary.PROOF_PREFIX) ||
      name.startsWith("proof_") ||
      name.startsWith("challenge_")
    );
  }

  /**
   * Delete the data of a hash no object uses and no other upload waits for, with its proofs
   * @param hash - the binary hash
   */
  protected async deleteUnusedData(hash: string): Promise<void> {
    if ((await this.getUsageCount(hash)) > 0) {
      return;
    }
    const pending = await this._s3.listObjectsV2({
      Bucket: this.parameters.bucket,
      Prefix: posix.join(this.parameters.prefix || "", "_pending", hash) + "/"
    });
    if (pending.Contents?.length) {
      return;
    }
    // Only the data and the proofs are left
    await this._cleanHash(hash);
  }

  /**
   * Remove the pending uploads older than `pendingTimeout`, and their data when no object uses it
   * @param now - the current time in ms
   * @returns the number of pending uploads removed
   */
  async sweepPending(now: number = Date.now()): Promise<number> {
    const prefix = posix.join(this.parameters.prefix || "", "_pending") + "/";
    const timeout = this.parameters.pendingTimeout * 1000;
    let removed = 0;
    await this.forEachFile(
      this.parameters.bucket,
      async Key => {
        const pending = await this.getPendingUpload(Key);
        if (!pending) {
          return;
        }
        // An unreadable marker falls back to its modification date
        const created =
          typeof pending.created === "number" ? pending.created : (await this.exists(Key))?.LastModified?.getTime();
        if (created !== undefined && now - created <= timeout) {
          return;
        }
        await this._s3.deleteObject({ Bucket: this.parameters.bucket, Key });
        removed++;
        await this.deleteUnusedData(Key.substring(prefix.length).split("/")[0]);
      },
      prefix
    );
    return removed;
  }

  /**
   * Put an empty marker object next to the binary data
   * @param hash - the binary hash
   * @param suffix - the marker name
   * @param storeName - the model identifier using the binary
   * @returns the putObject result
   */
  putMarker(hash: string, suffix: string, storeName: string) {
    const s3obj = new S3(this._s3Config);
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
    return getSignedUrl(new S3(this._s3Config), command, params);
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
    params.ResponseContentDisposition = contentDisposition(binaryMap.name || binaryMap.originalname);
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
    return this.getContent(this.getContentUrl(this._getKey(info.hash)));
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
    return data.Contents.filter(k => this.isUsageMarker(k.Key)).length;
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
   * @param attribute - the binary attribute, if undefined every usage of the object (its deletion): the usages of the
   * other objects are kept, the data and its proofs are removed only once no usage and no pending upload remain
   */
  async _cleanUsage(hash: string, uuid: string, attribute?: string) {
    if (!attribute) {
      const keys = (
        (
          await this._s3.listObjectsV2({
            Bucket: this.parameters.bucket,
            Prefix: this._getKey(hash, "")
          })
        ).Contents ?? []
      )
        .map(c => c.Key)
        .filter(Key => this.isUsageMarker(Key) && Key.endsWith(`_${uuid}`));
      for (const Key of keys) {
        await this._s3.deleteObject({ Bucket: this.parameters.bucket, Key });
      }
      await this.deleteUnusedData(hash);
      return;
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
  /**
   * Get an object from s3 bucket
   * @deprecated Use {@link getContent} instead.
   * @param key to get
   * @param bucket to retrieve from or default bucket
   * @returns the object content stream
   */
  async getObject(key: string, bucket?: string): Promise<Readable> {
    const targetBucket = bucket || this.parameters.bucket;
    return this.getContent(`s3://${targetBucket}/${key}`);
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
    const s3 = new S3(this._s3Config);
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
   * @deprecated Use {@link putContent} instead.
   * @param key to add to
   * @param body content of the object
   * @param metadatas to put along the object
   * @param bucket to use
   * @returns Content info
   */
  async putObject(
    key: string,
    body: Buffer | Blob | string | ReadableStream,
    metadatas = {},
    bucket: string = this.parameters.bucket
  ) {
    return this.putContent(`s3://${bucket}/${key}`, body as any, {
      metadata: metadatas
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
    // Computed from the bytes: a preset hash that does not match is rejected, a preset challenge is replaced
    await this.verifiedHashes(file);
    const data = await this._getS3(file.hash);
    if (data === undefined) {
      const s3metas: Record<string, string> = {};
      s3metas["x-amz-meta-challenge"] = file.challenge;
      const url = this.getContentUrl(this._getKey(file.hash));
      await this.putContent(url, await file.get(), {
        metadata: s3metas,
        contentLength: file.size,
        contentType: file.mimetype
      });
    }
    // The proof of possession of the content, computed from the bytes, compared on later challenges
    await this.putMarker(file.hash, this.proofMarker(file.challenge), "proof");

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
