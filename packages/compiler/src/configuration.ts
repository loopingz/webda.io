import { FileUtils, JSONUtils } from "@webda/utils";
import { JSONSchema7 } from "json-schema";

/**
 * Generate the configuration schema
 *
 * @param filename to save for
 * @param full to keep all required
 */
export function generateConfigurationSchemas(
  filename: string = ".webda/config-schema.json",
  deploymentFilename: string = ".webda/deployment-schema.json",
  full: boolean = false
) {
  // Ensure we have compiled already
  this.compile();

  const rawSchema: JSONSchema7 = this.schemaGenerator.createSchema("UnpackedConfiguration");
  let res: JSONSchema7 = <JSONSchema7>rawSchema.definitions["UnpackedConfiguration"];
  res.definitions ??= {};
  // Add the definition for types
  res.definitions.ServicesType = {
    type: "string",
    enum: Object.keys(this.app.getModdas() || {})
  };
  res.properties.services = {
    type: "object",
    additionalProperties: {
      oneOf: []
    }
  };
  const addServiceSchema = (type: "ServiceType" | "BeanType") => {
    return serviceType => {
      const key = `${type}$${serviceType.replace(/\//g, "$")}`;
      const definition: JSONSchema7 = (res.definitions[key] = this.app.getSchema(serviceType));
      /* should try to mock the getSchema */
      /* c8 ignore next 3 */
      if (!definition) {
        return;
      }
      definition.title ??= serviceType;
      (<JSONSchema7>definition.properties.type).pattern = this.getServiceTypePattern(serviceType);
      (<JSONSchema7>(<JSONSchema7>res.properties.services).additionalProperties).oneOf.push({
        $ref: `#/definitions/${key}`
      });
      delete res.definitions[key]["$schema"];
      // Flatten definition (might not be the best idea)
      for (const def in definition.definitions) {
        res.definitions[def] ??= definition.definitions[def];
      }
      delete definition.definitions;
      // Remove mandatory depending on option
      if (!full) {
        res.definitions[key]["required"] = ["type"];
      }
      // Predefine beans
      if (type === "BeanType") {
        (<JSONSchema7>res.properties.services).properties ??= {};
        res.properties.services[definition.title] = {
          $ref: `#/definitions/${key}`
        };
        (<JSONSchema7>res.definitions[key]).required ??= [];
        (<JSONSchema7>res.definitions[key]).required = (<JSONSchema7>res.definitions[key]).required.filter(
          p => p !== "type"
        );
      }
    };
  };
  Object.keys(this.app.getModdas()).forEach(addServiceSchema("ServiceType"));
  Object.keys(this.app.getBeans()).forEach(addServiceSchema("BeanType"));
  FileUtils.save(res, filename);
  // Build the deployment schema
  // Ensure builtin deployers are there
  const definitions = JSONUtils.duplicate(res.definitions);
  res = {
    properties: {
      parameters: {
        type: "object",
        additionalProperties: true
      },
      resources: {
        type: "object",
        additionalProperties: true
      },
      services: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      units: {
        type: "array",
        items: { oneOf: [] }
      }
    },
    definitions: res.definitions
  };
  const appServices = this.app.getConfiguration().services;
  Object.keys(appServices).forEach(k => {
    if (!appServices[k]) {
      return;
    }
    const key = `Service$${k}`;
    (<JSONSchema7>res.properties.services).properties[k] = {
      type: "object",
      oneOf: [
        { $ref: `#/definitions/${key}` },
        ...Object.keys(definitions)
          .filter(name => name.startsWith("ServiceType"))
          .map(dkey => ({ $ref: `#/definitions/${dkey}` }))
      ]
    };
  });
  Object.keys(this.app.getDeployers()).forEach(serviceType => {
    const key = `DeployerType$${serviceType.replace(/\//g, "$")}`;
    const definition: JSONSchema7 = (res.definitions[key] = this.app.getSchema(serviceType));
    if (!definition) {
      return;
    }
    definition.title = serviceType;
    (<JSONSchema7>definition.properties.type).pattern = this.getServiceTypePattern(serviceType);
    (<JSONSchema7>(<JSONSchema7>res.properties.units).items).oneOf.push({
      $ref: `#/definitions/${key}`
    });
    delete definition["$schema"];
    // Remove mandatory depending on option
    if (!full) {
      definition["required"] = ["type"];
    }
  });
  FileUtils.save(res, deploymentFilename);
}
