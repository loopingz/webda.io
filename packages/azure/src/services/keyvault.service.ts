import { CryptographyClient } from "@azure/keyvault-keys";
import { SecretClient } from "@azure/keyvault-secrets";
import { ConfigurationProvider, CryptoService, SecretString, Service, WebdaError } from "@webda/core";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AzureParameters, AzureServiceParameters, getAzureCredential } from "./azure-parameters.js";
import { AzureContributor, AzureDeployerInfo, AzureResourceContribution } from "./contributors.js";

/** Settings for the Key Vault service and configuration encrypter. */
export class AzureKeyVaultParameters extends AzureParameters {
  vaultUrl!: string;
  keyId?: string;
}

interface Envelope {
  version: 1;
  keyId: string;
  wrappedKey: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

type AzureEncryptionOptions = AzureServiceParameters & { keyId?: string };
let configuredEncryption: AzureEncryptionOptions = {};

/**
 * Validate key identifiers before sending credentials or wrapped keys to their endpoints.
 * @param keyId - key id
 * @returns The validate key id result
 */
function validateKeyId(keyId: string): string {
  if (
    !/^https:\/\/[a-zA-Z0-9-]+\.vault\.(?:azure\.net|azure\.cn|usgovcloudapi\.net)\/keys\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)?$/.test(
      keyId
    )
  ) {
    throw new WebdaError.CodeError("AZURE_KEY_ID", "A full Azure Key Vault key URL is required");
  }
  return keyId;
}

/** Authenticated envelope encryption: only the random AES key leaves this process. */
export const azureEncrypter = {
  /** Configure the encryption pass before application services are created.
   * @param options - Azure credential and key settings for this configuration pass
   */
  configure(options: AzureEncryptionOptions): void {
    configuredEncryption = { ...options };
  },
  /**
   * Encrypt a configuration value with a wrapped AES key.
   * @param data - Model data or encrypted envelope
   * @param options - Encryption or packaging options
   * @returns The encrypt result
   */
  async encrypt(data: string, options: string | AzureEncryptionOptions = configuredEncryption): Promise<string> {
    const params = typeof options === "string" ? { keyId: options } : options;
    const keyId = validateKeyId(params.keyId ?? process.env.WEBDA_AZURE_KEY_ID ?? "");
    const key = randomBytes(32);
    try {
      const client = new CryptographyClient(keyId, getAzureCredential(params));
      const wrapped = await client.wrapKey("RSA-OAEP-256", key);
      // Pin the actual key version so rotating the vault key does not break existing values.
      const resolvedKeyId = validateKeyId(wrapped.keyID ?? keyId);
      if (new URL(resolvedKeyId).origin !== new URL(keyId).origin || resolvedKeyId.split("/").length !== 6) {
        throw new WebdaError.CodeError("AZURE_KEY_VERSION", "Key Vault must return a versioned key identifier");
      }
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`1:${resolvedKeyId}`));
      const ciphertext = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
      const envelope: Envelope = {
        version: 1,
        keyId: resolvedKeyId,
        wrappedKey: Buffer.from(wrapped.result).toString("base64url"),
        iv: iv.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
        ciphertext: ciphertext.toString("base64url")
      };
      return Buffer.from(JSON.stringify(envelope)).toString("base64url");
    } finally {
      key.fill(0);
    }
  },

  /**
   * Decrypt and authenticate an Azure envelope.
   * @param data - Model data or encrypted envelope
   * @param params - Raw configuration parameters
   * @returns The decrypt result
   */
  async decrypt(data: string, params: AzureServiceParameters = configuredEncryption): Promise<string> {
    let key: Buffer | undefined;
    try {
      const envelope: Envelope = JSON.parse(Buffer.from(data, "base64url").toString());
      if (envelope.version !== 1) throw new Error();
      validateKeyId(envelope.keyId);
      const decode = (value: string, size?: number) => {
        if (typeof value !== "string" || !/^[\w-]*$/.test(value)) throw new Error();
        const bytes = Buffer.from(value, "base64url");
        if (bytes.toString("base64url") !== value || (size !== undefined && bytes.length !== size)) throw new Error();
        return bytes;
      };
      const iv = decode(envelope.iv, 12),
        tag = decode(envelope.tag, 16);
      const ciphertext = decode(envelope.ciphertext),
        wrappedKey = decode(envelope.wrappedKey);
      if (!wrappedKey.length || envelope.keyId.split("/").length !== 6) throw new Error();
      const client = new CryptographyClient(envelope.keyId, getAzureCredential(params));
      const unwrapped = await client.unwrapKey("RSA-OAEP-256", wrappedKey);
      key = Buffer.from(unwrapped.result);
      unwrapped.result.fill(0);
      if (key.length !== 32) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(`1:${envelope.keyId}`));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      // SDK exceptions can contain requests; never expose them with configuration secrets.
      throw new WebdaError.CodeError("AZURE_DECRYPT_FAILED", "Unable to decrypt Azure configuration value");
    } finally {
      key?.fill(0);
    }
  }
};

CryptoService.registerEncrypter("azure", azureEncrypter);

/** Key Vault secrets as a configuration source, with Key Vault envelope encryption.
 * @WebdaModda
 */
export class AzureKeyVault extends Service<AzureKeyVaultParameters> implements ConfigurationProvider, AzureContributor {
  static Parameters = AzureKeyVaultParameters;
  protected client!: SecretClient;

  /**
   * Perform init.
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    this.client = new SecretClient(this.parameters.vaultUrl, getAzureCredential(this.parameters));
    return this;
  }

  /**
   * Key Vault has no push-based configuration subscription; ConfigurationService polls.
   * @param _id - Configuration source identifier
   * @param _callback - Unused configuration change callback
   * @returns The can trigger configuration result
   */
  canTriggerConfiguration(_id: string, _callback: () => void): boolean {
    return false;
  }

  /**
   * Retrieve a secret without exposing its value to JSON or logs.
   * @param id - Secret name or exported cron identifier
   * @returns Masked secret value
   */
  async getSecret(id: string): Promise<SecretString> {
    let secret;
    try {
      secret = await this.client.getSecret(id);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404)
        throw new WebdaError.NotFound("Key Vault secret was not found");
      throw new WebdaError.ServiceUnavailable("Unable to retrieve Key Vault secret");
    }
    if (secret.value === undefined) throw new WebdaError.NotFound("Key Vault secret has no value");
    return new SecretString(secret.value, "azure");
  }

  /**
   * Load a JSON configuration document. Secret fields can use crypt:azure: values.
   * @param id - Secret name or exported cron identifier
   * @returns Resolved configuration object
   */
  async getConfiguration(id: string): Promise<Record<string, any>> {
    const value = await this.getSecret(id);
    let configuration: unknown;
    try {
      configuration = JSON.parse(value.getValue());
    } catch {
      throw new WebdaError.BadRequest("Key Vault configuration must be a JSON object");
    }
    if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
      throw new WebdaError.BadRequest("Key Vault configuration must be a JSON object");
    }
    return this.resolveReferences(configuration as Record<string, any>);
  }

  /**
   * Resolve whole-value ${keyvault:secret-name} references in a configuration document.
   * @param configuration - Configuration tree to resolve
   * @returns Configuration with secret references resolved
   */
  async resolveReferences<T>(configuration: T): Promise<T> {
    const resolve = async (value: unknown): Promise<unknown> => {
      if (typeof value === "string") {
        const match = /^\$\{keyvault:([a-zA-Z0-9-]+)\}$/.exec(value);
        return match ? this.getSecret(match[1]) : value;
      }
      if (Array.isArray(value)) return Promise.all(value.map(resolve));
      if (value && typeof value === "object" && !(value instanceof SecretString)) {
        return Object.fromEntries(
          await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await resolve(child)]))
        );
      }
      return value;
    };
    return (await resolve(configuration)) as T;
  }

  /**
   * Encrypt a configuration value with a wrapped AES key.
   * @param data - Model data or encrypted envelope
   * @param keyId - key id
   * @returns The encrypt result
   */
  encrypt(data: string, keyId = this.parameters.keyId): Promise<string> {
    return azureEncrypter.encrypt(data, { ...this.parameters, keyId });
  }

  /**
   * Decrypt and authenticate an Azure envelope.
   * @param data - Model data or encrypted envelope
   * @returns The decrypt result
   */
  async decrypt(data: string): Promise<SecretString> {
    return new SecretString(await azureEncrypter.decrypt(data, this.parameters), "azure");
  }

  /**
   * Describe the Azure resources and identity permissions required by this service.
   * @param deployer - Deployment scope and identity helpers
   * @returns The azure resources result
   */
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution {
    const name = new URL(this.parameters.vaultUrl).hostname.split(".")[0];
    const scope = `/subscriptions/${deployer.resources.subscriptionId}/resourceGroups/${deployer.resources.resourceGroup}/providers/Microsoft.KeyVault/vaults/${name}`;
    return {
      roleAssignments: ["4633458b-17de-408a-b874-0445c86b69e6", "12338af0-0e69-4776-bea7-57ae8d297424"].map(role => ({
        scope,
        roleDefinitionId: `/subscriptions/${deployer.resources.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${role}`
      }))
    };
  }
}
