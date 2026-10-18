import { posix } from "path";
import { Readable } from "node:stream";
import { OperationContext } from "../contexts/operationcontext.js";
import { BinaryMap, CoreModelWithBinary, BinaryParameters, BinaryService } from "./binary.service.js";
import {
  ContentStorage,
  ContentStorages,
  type ContentBody,
  type ContentPutOptions,
  type ContentGetOptions,
  type ContentInfo
} from "@webda/utils";

/**
 * Default binary parameters
 */
export class CloudBinaryParameters extends BinaryParameters {
  prefix?: string;
  contentStorage?: {
    register?: boolean;
    default?: boolean;
  } = { register: true, default: false };

  /**
   * Load parameters with an empty prefix default
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any): this {
    super.load(params);
    this.prefix ??= "";
    this.contentStorage = {
      register: params?.contentStorage?.register ?? true,
      default: params?.contentStorage?.default ?? false
    };
    return this;
  }
}

/**
 * CloudBinary abstraction
 */
export abstract class CloudBinary<T extends CloudBinaryParameters = CloudBinaryParameters>
  extends BinaryService<T>
  implements ContentStorage
{
  /**
   * Schemes handled, without ':' e.g. ["s3"], ["gs", "gcs"]
   */
  abstract readonly schemes: string[];

  /**
   * Get content read stream
   */
  abstract getContent(url: string, options?: ContentGetOptions): Promise<Readable>;

  /**
   * Put content stream, buffer or string
   */
  abstract putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo>;

  /**
   * Head content metadata
   */
  headContent?(url: string): Promise<ContentInfo | undefined>;

  /**
   * Delete content
   */
  deleteContent?(url: string): Promise<void>;

  /**
   * Get bucket to register in ContentStorages
   * @returns bucket name or undefined
   */
  getContentBucket(): string | undefined {
    return (this.parameters as any).bucket;
  }

  /**
   * Build <scheme>://<bucket>/<key>
   * @param key - object key
   * @returns content URL
   */
  protected getContentUrl(key: string): string {
    const scheme = this.schemes[0] || "s3";
    const bucket = this.getContentBucket();
    const cleanKey = key.replace(/^\/+/, "");
    return bucket ? `${scheme}://${bucket}/${cleanKey}` : `${scheme}:/${cleanKey}`;
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    if (this.parameters.contentStorage?.register !== false) {
      ContentStorages.register(this, {
        bucket: this.getContentBucket(),
        default: this.parameters.contentStorage?.default
      });
    }
    return this;
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    ContentStorages.unregister(this);
    await super.stop();
  }

  /**
   * Get a UrlFromObject
   *
   * @param binaryMap - the binary map definition
   * @param context - the execution context
   * @param expires - the expiration time
   * @returns the result
   */
  async getRedirectUrlFromObject(binaryMap, context, expires: number = 30) {
    return this.getSignedUrlFromMap(binaryMap, expires, context);
  }

  /**
   * Return the S3 key
   * @param hash - the hash value
   * @param suffix - the suffix to append
   * @returns the result string
   */
  _getKey(hash: string, suffix: string = "data"): string {
    // Object storage keys always use "/", whatever the platform
    return posix.join(this.parameters.prefix || "", hash, suffix);
  }

  /**
   * @override
   */
  // @ts-ignore
  async delete(object: CoreModelWithBinary, property: string, index: number) {
    const hash = index !== undefined ? object[property][index].hash : (object[property] as BinaryMap).hash;
    await this.deleteSuccess(object, property, index);
    await this._cleanUsage(hash, object.getUUID(), property);
  }

  /**
   * @override
   */
  async cascadeDelete(info: BinaryMap, uuid: string): Promise<void> {
    try {
      await this._cleanUsage(info.hash, uuid);
    } catch (err) {
      this.log("WARN", "Cascade delete failed", err);
    }
  }

  /**
   * Clean usage for a hash
   */
  abstract _cleanUsage(hash: string, uuid: string, attribute?: string): Promise<void>;

  /**
   * Retrieve one signed URL to download the file in parameter
   * @param {GetSignedUrlParams} params
   * @returns {string} URL in order to download the file
   */
  abstract getSignedUrlFromMap(map: BinaryMap, expires: number, context: OperationContext): Promise<string>;
}
