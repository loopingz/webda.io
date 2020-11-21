import { ConfigurationProvider, ModdaDefinition, Service, ServiceParameters } from "@webda/core";
import { GetAWS } from "./aws-mixin";

export class AWSSecretsManagerParameters extends ServiceParameters {
  endpoint: string;
  region: string;
}
export default class AWSSecretsManager<T extends AWSSecretsManagerParameters = AWSSecretsManagerParameters>
  extends Service<T>
  implements ConfigurationProvider {
  _client: any;

  /**
   * Load the parameters
   *
   * @param params
   */
  loadParameters(params: any) {
    return new AWSSecretsManagerParameters(params);
  }

  computeParameters() {
    this._client = new (GetAWS(this._params).SecretsManager)({
      endpoint: this._params.endpoint
    });
  }

  canTriggerConfiguration(id: string, callback: () => void) {
    return false;
  }

  async getConfiguration(id: string): Promise<Map<string, any>> {
    return this.get(id);
  }

  async create(id: string, values: any = {}, params: any = {}) {
    params.Name = id;
    params.SecretString = JSON.stringify(values);
    await this._client.createSecret(params).promise();
  }

  async delete(id: string, recovery: number = 7, force: boolean = false) {
    let params = {};
    if (force) {
      params = {
        SecretId: id,
        ForceDeleteWithoutRecovery: force
      };
    } else {
      params = {
        RecoveryWindowInDays: recovery,
        SecretId: id
      };
    }
    await this._client.deleteSecret(params).promise();
  }

  async put(id: string, value: any) {
    await this._client
      .putSecretValue({
        SecretId: id,
        SecretString: JSON.stringify(value)
      })
      .promise();
  }

  async get(id: string) {
    let res = await this._client
      .getSecretValue({
        SecretId: id
      })
      .promise();
    return JSON.parse(res.SecretString);
  }

  getARNPolicy(accountId) {
    let region = this._params.region || "us-east-1";
    return {
      Sid: this.constructor.name + this._name,
      Effect: "Allow",
      Action: ["secretsmanager:*"],
      Resource: ["arn:aws:secretsmanager:" + region + ":" + accountId + ":secret:*"]
    };
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/AWSSecretsManager",
      label: "AWSSecretsManager",
      description: "Implements AWS SecretsManager",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      logo: "images/icons/s3.png",
      configuration: {
        schema: {
          type: "object",
          properties: {}
        }
      }
    };
  }
}

export { AWSSecretsManager };
