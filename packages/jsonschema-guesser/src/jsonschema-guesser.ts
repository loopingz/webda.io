import { Service, ServiceParameters } from "../../core/src";

type JsonSchemaConfiguration = {
  maxDepth?: number;
  maxProperties?: number;
  maxItems?: number;
};

class JsonSchemaGuessModel {
  name: string;
  configuration: JsonSchemaConfiguration;
}

class JsonSchemaGuesserParameters extends ServiceParameters {
  configuration: JsonSchemaConfiguration;
}

export class JsonSchemaGuesserService<
  T extends JsonSchemaGuesserParameters = JsonSchemaGuesserParameters
> extends Service<T> {
  updateSchema(name: string, object: any): void {
    // Do nothing
    try {
      (async function () {})();
    } catch (e) {
      this.log("ERROR", "Cannot update schema", e);
    }
  }

  async stop(): Promise<void> {}
}
