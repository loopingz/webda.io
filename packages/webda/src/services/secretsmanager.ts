import { Service, ConfigurationProvider } from '../index';

class AwsSecretsManager extends Service implements ConfigurationProvider {
  getConfiguration(id: string) : Promise<Map<string, any>> {
    return undefined;
  }
}