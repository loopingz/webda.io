import { FileUtils, JSONUtils } from "@webda/utils";
import { JSONSchema7 } from "json-schema";
import { relative, dirname } from "node:path";

/**
 * Interface for the application methods needed by configuration schema generation
 */
export interface ConfigSchemaApplication {
  getModdas(): { [key: string]: any };
  getSchema(type: string): JSONSchema7;
  getDeployers(): { [key: string]: any };
  getConfiguration(): { services: { [key: string]: any } };
  getModules(): { beans?: { [key: string]: any } };
  completeNamespace(name: string): string;
}

/**
 * Generate regex based on a service name
 *
 * The regex will ensure the namespace is optional
 *
 * @param app
 * @param type
 * @returns
 */
function getServiceTypePattern(app: ConfigSchemaApplication, type: string): string {
  const split = app.completeNamespace(type).split("/");
  return `^(${split[0]}/)?${split[1]}$`;
}

/**
 * Generate the configuration and deployment schemas
 *
 * @param app to use for application metadata
 * @param filename to save config schema to
 * @param deploymentFilename to save deployment schema to
 * @param full to keep all required
 */
export function generateConfigurationSchemas(
  app: ConfigSchemaApplication,
  filename: string = ".webda/config.schema.json",
  deploymentFilename: string = ".webda/deployment.schema.json",
  full: boolean = false,
  configFile?: string
) {
  // Build the base configuration schema structure
  let res: JSONSchema7 = {
    type: "object",
    properties: {
      $schema: { type: "string" },
      $import: {
        anyOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }],
        description: "Include other configuration files"
      },
      version: { type: "number" },
      parameters: {
        type: "object",
        additionalProperties: true,
        description: "Global parameters shared between all services"
      },
      services: {
        type: "object",
        additionalProperties: {
          oneOf: []
        }
      },
      models: {
        type: "object",
        additionalProperties: true
      }
    },
    definitions: {}
  };
  // Add the definition for types
  res.definitions.ServicesType = {
    type: "string",
    enum: Object.keys(app.getModdas() || {})
  };
  const addServiceSchema = (type: "ServiceType" | "BeanType") => {
    return serviceType => {
      const key = `${type}$${serviceType.replace(/\//g, "$")}`;
      const definition: JSONSchema7 = (res.definitions[key] = app.getSchema(serviceType));
      /* should try to mock the getSchema */
      /* c8 ignore next 3 */
      if (!definition) {
        return;
      }
      definition.title ??= serviceType;
      if (definition.properties?.type) {
        (<JSONSchema7>definition.properties.type).pattern = getServiceTypePattern(app, serviceType);
      }
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
  Object.keys(app.getModdas()).forEach(addServiceSchema("ServiceType"));
  Object.keys(app.getModules().beans || {}).forEach(addServiceSchema("BeanType"));
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
  const appServices = app.getConfiguration().services;
  Object.keys(appServices || {}).forEach(k => {
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
  Object.keys(app.getDeployers()).forEach(serviceType => {
    const key = `DeployerType$${serviceType.replace(/\//g, "$")}`;
    const definition: JSONSchema7 = (res.definitions[key] = app.getSchema(serviceType));
    if (!definition) {
      return;
    }
    definition.title = serviceType;
    if (definition.properties?.type) {
      (<JSONSchema7>definition.properties.type).pattern = getServiceTypePattern(app, serviceType);
    }
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

  // Ensure $schema is set in the configuration file
  if (configFile) {
    const config = FileUtils.load(configFile);
    const schemaRef = relative(dirname(configFile), filename);
    if (config.$schema !== schemaRef) {
      config.$schema = schemaRef;
      FileUtils.save(config, configFile);
    }
  }
}
