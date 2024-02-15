import { join } from "path";
import { Context } from "../utils/context";
import { BinaryMap, BinaryModel, BinaryParameters, BinaryService } from "./binary";

/**
 * Default binary parameters
 */
export class CloudBinaryParameters extends BinaryParameters {
  prefix?: string;

  constructor(params: any, service: BinaryService) {
    super(params, service);
    this.prefix ??= "";
  }
}

/**
 * CloudBinary abstraction
 */
export abstract class CloudBinary<T extends CloudBinaryParameters = CloudBinaryParameters> extends BinaryService<T> {
  /**
   * @override
   */
  loadParameters(params: any) {
    return new CloudBinaryParameters(params, this);
  }

  /**
   * Get a UrlFromObject
   *
   */
  async getRedirectUrlFromObject(binaryMap, context, expires: number = 30) {
    return this.getSignedUrlFromMap(binaryMap, expires, context);
  }

  /**
   * Return the S3 key
   * @param hash
   * @param suffix
   * @returns
   */
  _getKey(hash: string, suffix: string = "data"): string {
    return join(`${this.parameters.prefix}`, hash, suffix);
  }

  /**
   * @inheritdoc
   */
  async delete(object: BinaryModel, property: string, index: number) {
    let hash = object[property][index].hash;
    await this.deleteSuccess(object, property, index);
    await this._cleanUsage(hash, object.getUuid(), property);
  }

  /**
   * @inheritdoc
   */
  async cascadeDelete(info: BinaryMap, uuid: string): Promise<void> {
    try {
      await this._cleanUsage(info.hash, uuid);
    } catch (err) {
      this._webda.log("WARN", "Cascade delete failed", err);
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
  abstract getSignedUrlFromMap(map: BinaryMap, expires: number, context: Context): Promise<string>;
}
