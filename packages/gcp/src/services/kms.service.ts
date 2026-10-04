import { KeyManagementServiceClient } from "@google-cloud/kms";
import { CryptoService, Service, ServiceParameters } from "@webda/core";

/**
 * Encrypter for GCP KMS
 */
const encrypter = {
  encrypt: async (data: string, key?: string): Promise<string> => {
    key ??= process.env.WEBDA_GCP_KMS_KEY;
    // Only the odd elements are dynamic
    const infos = key.split("/").filter((i, ind) => ind % 2 === 1);
    const client = new KeyManagementServiceClient();
    // Encode the infos in base64
    // Add the encrypted info after a : separator
    return (
      Buffer.from(infos.join(":")).toString("base64") +
      ":" +
      Buffer.from(
        (
          await client.encrypt({
            name: key,
            plaintext: Buffer.from(data)
          })
        )[0].ciphertext
      ).toString("base64")
    );
  },
  decrypt: async (data: string): Promise<string> => {
    // Get the info
    const info = data.substring(0, data.indexOf(":"));
    const infos = Buffer.from(info, "base64").toString().split(":");
    if (infos.length !== 4) {
      throw new Error("Invalid KMS encryption");
    }
    const client = new KeyManagementServiceClient();
    const [result] = await client.decrypt({
      name: `projects/${infos[0]}/locations/${infos[1]}/keyRings/${infos[2]}/cryptoKeys/${infos[3]}`,
      ciphertext: Buffer.from(data.substring(data.indexOf(":") + 1), "base64")
    });
    // plaintext is a Uint8Array (or a string): always return a string
    return Buffer.from(<any>result.plaintext).toString();
  }
};

/**
 * Register the encrypter
 */
CryptoService.registerEncrypter("gcp", encrypter);

/**
 * Parameters for the KMS Service
 */
export class KMSServiceParameters extends ServiceParameters {
  /**
   * Encryption key to use by default
   * @default WEBDA_GCP_KMS_KEY env variable
   */
  defaultKey?: string;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.defaultKey ??= process.env.WEBDA_GCP_KMS_KEY;
    return this;
  }
}

/**
 * Expose KMS Service
 *
 * @WebdaModda GoogleCloudKMS
 */
export class GCPKMSService<T extends KMSServiceParameters = KMSServiceParameters> extends Service<T> {
  /**
   * Encrypt a data with GCP KMS given key or defaultKey
   * @param data - the data to encrypt
   * @param key - the KMS key name, defaults to `defaultKey`
   * @returns the encrypted data prefixed with the key information
   */
  encrypt(data: string, key?: string): Promise<string> {
    return encrypter.encrypt(data, key || this.parameters.defaultKey);
  }

  /**
   * Decrypt a data previously encrypted with this service
   * @param data - the data returned by {@link encrypt}
   * @returns the decrypted data
   */
  decrypt(data: string): Promise<string> {
    return encrypter.decrypt(data);
  }
}
