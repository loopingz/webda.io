import {
  Service,
  ConfigurationProvider,
  AWSMixIn,
  Core as Webda
} from "../index";

export default class AwsSecretsManager extends AWSMixIn(Service)
  implements ConfigurationProvider {
  _client: any;

  async init(): Promise<void> {
    await super.init();
    this._client = new (this._getAWS(this._params)).SecretsManager();
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
      Resource: [
        "arn:aws:secretsmanager:" + region + ":" + accountId + ":secret:*"
      ]
    };
  }

  static getModda() {
    return {
      uuid: "Webda/SecretsManager",
      label: "SecretsManager",
      description: "Implements AWS SecretsManager",
      webcomponents: [],
      documentation:
        "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      logo: "images/icons/s3.png",
      configuration: {
        default: {},
        schema: {
          type: "object",
          properties: {}
        }
      }
    };
  }
}

export { AwsSecretsManager };
