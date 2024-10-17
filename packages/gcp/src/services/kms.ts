import { KeyManagementServiceClient } from "@google-cloud/kms";
import { CryptoService, Service, ServiceParameters } from "@webda/core";
import { DeepPartial } from "@webda/tsc-esm";

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
    return <string>(
      await client.decrypt({
        name: `projects/${infos[0]}/locations/${infos[1]}/keyRings/${infos[2]}/cryptoKeys/${infos[3]}`,
        ciphertext: Buffer.from(data.substring(data.indexOf(":") + 1), "base64")
      })
    )[0].plaintext;
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
  default() {
    super.default();
    this.defaultKey ??= process.env.WEBDA_GCP_KMS_KEY;
  }
}

/**
 * Expose KMS Service
 *
 * @WebdaModda GoogleCloudKMS
 */
export class GCPKMSService<T extends KMSServiceParameters> extends Service<T> {
  client: KeyManagementServiceClient;

  /**
   * @override
   */
  loadParameters(params: DeepPartial<T>): T {
    return <T>new KMSServiceParameters().load(params);
  }

  /**
   * Encrypt a data with GCP KMS given key or defaultKey
   * @param data
   * @param key
   * @returns
   */
  encrypt(data: string, key?: string): Promise<string> {
    return encrypter.encrypt(data, key || this.parameters.defaultKey);
  }

  /**
   * Decrypt a data previously encrypted with this service
   * @param data
   * @returns
   */
  decrypt(data: string): Promise<string> {
    return encrypter.decrypt(data);
  }
}
