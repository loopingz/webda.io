import { join } from "path";
import { OperationContext } from "../contexts/operationcontext.js";
import { BinaryMap, CoreModelWithBinary, BinaryParameters, BinaryService } from "./binary.js";

/**
 * Default binary parameters
 */
export class CloudBinaryParameters extends BinaryParameters {
  prefix?: string;

  load(params: any): this {
    super.load(params);
    this.prefix ??= "";
    return this;
  }
}

/**
 * CloudBinary abstraction
 */
export abstract class CloudBinary<T extends CloudBinaryParameters = CloudBinaryParameters> extends BinaryService<T> {
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
  // @ts-ignore
  async delete(object: CoreModelWithBinary, property: string, index: number) {
    const hash = index !== undefined ? object[property][index].hash : (object[property] as BinaryMap).hash;
    await this.deleteSuccess(object, property, index);
    await this._cleanUsage(hash, object.getUUID(), property);
  }

  /**
   * @inheritdoc
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
