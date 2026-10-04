import { DeleteSecretRequest, SecretsManager } from "@aws-sdk/client-secrets-manager";
import { ConfigurationProvider, Service, ServiceParameters } from "@webda/core";
import { AWSServiceParameters, loadAWSParameters } from "./aws-parameters.js";

/**
 * AWS SecretsManager parameters
 */
export class AWSSecretsManagerParameters extends ServiceParameters implements AWSServiceParameters {
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
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    return this;
  }
}

/**
 * Use AWS SecretsManager as a configuration provider and secret storage
 *
 * @WebdaModda
 */
export default class AWSSecretsManager<T extends AWSSecretsManagerParameters = AWSSecretsManagerParameters>
  extends Service<T>
  implements ConfigurationProvider
{
  _client: SecretsManager;

  /**
   * Create the AWS client
   * @override
   */
  computeParameters() {
    super.computeParameters();
    this._client = new SecretsManager(this.parameters);
  }

  /**
   * SecretsManager cannot notify changes
   * @param _id - configuration id
   * @param _callback - change callback
   * @returns false
   */
  canTriggerConfiguration(_id: string, _callback: () => void) {
    return false;
  }

  /**
   * Retrieve the configuration stored in a secret
   * @param id - secret id
   * @returns the secret content
   */
  async getConfiguration(id: string): Promise<{ [key: string]: any }> {
    return this.get(id);
  }

  /**
   * Create a new secret on AWS SecretsManager
   *
   * @param id - secret name
   * @param values - secret content
   * @param params - additional createSecret parameters
   */
  async create(id: string, values: any = {}, params: any = {}) {
    params.Name = id;
    params.SecretString = JSON.stringify(values);
    await this._client.createSecret(params);
  }

  /**
   * Delete a secret
   *
   * @param SecretId to delete
   * @param RecoveryWindowInDays - days before the secret is deleted
   * @param ForceDeleteWithoutRecovery - delete immediately
   */
  async delete(SecretId: string, RecoveryWindowInDays: number = 7, ForceDeleteWithoutRecovery: boolean = false) {
    let params: DeleteSecretRequest = {
      RecoveryWindowInDays,
      SecretId
    };
    if (ForceDeleteWithoutRecovery) {
      params = {
        SecretId,
        ForceDeleteWithoutRecovery
      };
    }
    await this._client.deleteSecret(params);
  }

  /**
   * Store data in a AWS secret
   *
   * @param SecretId - secret id
   * @param value - secret content
   */
  async put(SecretId: string, value: any) {
    await this._client.putSecretValue({
      SecretId,
      SecretString: JSON.stringify(value)
    });
  }

  /**
   * Return SecretValue
   *
   * @param SecretId - secret id
   * @returns JSON.parse of SecretString
   */
  async get(SecretId: string) {
    const res = await this._client.getSecretValue({
      SecretId
    });
    return JSON.parse(res.SecretString);
  }

  /**
   * IAM policy required by the service
   * @param accountId - AWS account id
   * @returns the policy statement
   */
  getARNPolicy(accountId: string) {
    const region = this.parameters.region || "us-east-1";
    return {
      Sid: this.constructor.name + this.getName(),
      Effect: "Allow",
      Action: ["secretsmanager:*"],
      Resource: ["arn:aws:secretsmanager:" + region + ":" + accountId + ":secret:*"]
    };
  }
}

export { AWSSecretsManager };
