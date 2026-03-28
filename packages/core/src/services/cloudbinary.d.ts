import { OperationContext } from "../contexts/operationcontext.js";
import { BinaryMap, CoreModelWithBinary, BinaryParameters, BinaryService } from "./binary.js";
/**
 * Default binary parameters
 */
export declare class CloudBinaryParameters extends BinaryParameters {
    prefix?: string;
    load(params: any): this;
}
/**
 * CloudBinary abstraction
 */
export declare abstract class CloudBinary<T extends CloudBinaryParameters = CloudBinaryParameters> extends BinaryService<T> {
    /**
     * Get a UrlFromObject
     *
     */
    getRedirectUrlFromObject(binaryMap: any, context: any, expires?: number): Promise<string>;
    /**
     * Return the S3 key
     * @param hash
     * @param suffix
     * @returns
     */
    _getKey(hash: string, suffix?: string): string;
    /**
     * @inheritdoc
     */
    delete(object: CoreModelWithBinary, property: string, index: number): Promise<void>;
    /**
     * @inheritdoc
     */
    cascadeDelete(info: BinaryMap, uuid: string): Promise<void>;
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
//# sourceMappingURL=cloudbinary.d.ts.map