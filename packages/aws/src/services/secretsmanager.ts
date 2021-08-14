import { ConfigurationProvider, ModdaDefinition, Service, ServiceParameters } from "@webda/core";
import { GetAWS } from "./aws-mixin";

export class AWSSecretsManagerParameters extends ServiceParameters {
  endpoint: string;
  region: string;
}
export default class AWSSecretsManager<T extends AWSSecretsManagerParameters = AWSSecretsManagerParameters>
  extends Service<T>
  implements ConfigurationProvider
{
  _client: AWS.SecretsManager;

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
    this._client = new (GetAWS(this.parameters).SecretsManager)({
      endpoint: this.parameters.endpoint
    });
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

  async create(id: string, values: any = {}, params: any = {}) {
    params.Name = id;
    params.SecretString = JSON.stringify(values);
    await this._client.createSecret(params).promise();
  }

  /**
   * Delete a secret
   * 
   * @param SecretId to delete
   * @param RecoveryWindowInDays 
   * @param ForceDeleteWithoutRecovery 
   */
  async delete(SecretId: string, RecoveryWindowInDays: number = 7, ForceDeleteWithoutRecovery: boolean = false) {
    let params : AWS.SecretsManager.DeleteSecretRequest = {
      RecoveryWindowInDays,
      SecretId
    };
    if (ForceDeleteWithoutRecovery) {
      params = {
        SecretId,
        ForceDeleteWithoutRecovery
      };
    }
    await this._client.deleteSecret(params).promise();
  }

  /**
   * Store data in a AWS secret
   * 
   * @param SecretId 
   * @param value 
   */
  async put(SecretId: string, value: any) {
    await this._client
      .putSecretValue({
        SecretId,
        SecretString: JSON.stringify(value)
      })
      .promise();
  }

  /**
   * Return SecretValue
   * 
   * @param SecretId  
   * @returns JSON.parse of SecretString
   */
  async get(SecretId: string) {
    let res = await this._client
      .getSecretValue({
        SecretId
      })
      .promise();
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

  /**
   * @inheritdoc
   */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/AWSSecretsManager",
      label: "AWSSecretsManager",
      description: "Implements AWS SecretsManager",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      logo: "images/icons/s3.png"
    };
  }
}

export { AWSSecretsManager };
