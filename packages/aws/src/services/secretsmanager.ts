import { ConfigurationProvider, Service, ServiceParameters } from "@webda/core";
import { DeleteSecretRequest, SecretsManager } from "@aws-sdk/client-secrets-manager";
import { AWSServiceParameters } from "./aws-mixin";

export class AWSSecretsManagerParameters extends AWSServiceParameters(ServiceParameters) {}

/**
 * @WebdaModda
 */
export default class AWSSecretsManager<T extends AWSSecretsManagerParameters = AWSSecretsManagerParameters>
  extends Service<T>
  implements ConfigurationProvider
{
  _client: SecretsManager;

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new AWSSecretsManagerParameters(params);
  }

  /**
   * @inheritdoc
   */
  computeParameters() {
    this._client = new SecretsManager(this.parameters);
  }

  /**
   * @inheritdoc
   */
  canTriggerConfiguration(id: string, callback: () => void) {
    return false;
  }

  /**
   * @inheritdoc
   */
  async getConfiguration(id: string): Promise<Map<string, any>> {
    return this.get(id);
  }

  /**
   * Create a new secret on AWS SecretsManager
   *
   * @param id
   * @param values
   * @param params
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
   * @param RecoveryWindowInDays
   * @param ForceDeleteWithoutRecovery
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
   * @param SecretId
   * @param value
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
   * @param SecretId
   * @returns JSON.parse of SecretString
   */
  async get(SecretId: string) {
    let res = await this._client.getSecretValue({
      SecretId
    });
    return JSON.parse(res.SecretString);
  }

  /**
   * @inheritdoc
   */
  getARNPolicy(accountId) {
    let region = this.parameters.region || "us-east-1";
    return {
      Sid: this.constructor.name + this._name,
      Effect: "Allow",
      Action: ["secretsmanager:*"],
      Resource: ["arn:aws:secretsmanager:" + region + ":" + accountId + ":secret:*"]
    };
  }
}

export { AWSSecretsManager };
