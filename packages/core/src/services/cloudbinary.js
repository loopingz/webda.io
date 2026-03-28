import { join } from "path";
import { BinaryParameters, BinaryService } from "./binary.js";
/**
 * Default binary parameters
 */
export class CloudBinaryParameters extends BinaryParameters {
    load(params) {
        super.load(params);
        this.prefix ?? (this.prefix = "");
        return this;
    }
}
/**
 * CloudBinary abstraction
 */
export class CloudBinary extends BinaryService {
    /**
     * Get a UrlFromObject
     *
     */
    async getRedirectUrlFromObject(binaryMap, context, expires = 30) {
        return this.getSignedUrlFromMap(binaryMap, expires, context);
    }
    /**
     * Return the S3 key
     * @param hash
     * @param suffix
     * @returns
     */
    _getKey(hash, suffix = "data") {
        return join(`${this.parameters.prefix}`, hash, suffix);
    }
    /**
     * @inheritdoc
     */
    // @ts-ignore
    async delete(object, property, index) {
        const hash = index !== undefined ? object[property][index].hash : object[property].hash;
        await this.deleteSuccess(object, property, index);
        await this._cleanUsage(hash, object.getUUID(), property);
    }
    /**
     * @inheritdoc
     */
    async cascadeDelete(info, uuid) {
        try {
            await this._cleanUsage(info.hash, uuid);
        }
        catch (err) {
            this.log("WARN", "Cascade delete failed", err);
        }
    }
}
//# sourceMappingURL=cloudbinary.js.map