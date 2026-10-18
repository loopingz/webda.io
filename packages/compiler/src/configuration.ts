import { FileUtils, JSONUtils } from "@webda/utils";
import { JSONSchema7 } from "json-schema";
import { relative, dirname, resolve, isAbsolute, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

/**
 * Interface for the application methods needed by configuration schema generation
 */
export interface ConfigSchemaApplication {
  getModdas(): { [key: string]: any };
  getSchema(type: string): JSONSchema7;
  getDeployers(): { [key: string]: any };
  getConfiguration(): { services: { [key: string]: any } };
  getModules(): { beans?: { [key: string]: any }; models?: Record<string, any>; behaviors?: Record<string, any> };
  completeNamespace(name: string): string;
}

/**
 * Generate regex based on a service name
 *
 * The regex will ensure the namespace is optional
 *
 * @param app - the application to resolve namespaces
 * @param type - the service type name
 * @returns regex pattern string
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
 * @param configFile - optional config file path to update $schema reference
 * @param deploymentsDir - optional deployments directory to update $schema references
 */
export function generateConfigurationSchemas(
  app: ConfigSchemaApplication,
  filename: string = ".webda/config.schema.json",
  deploymentFilename: string = ".webda/deployment.schema.json",
  full: boolean = false,
  configFile?: string,
  deploymentsDir?: string
): void {
  const projectDir = configFile ? dirname(resolve(configFile)) : process.cwd();
  const absFilename = isAbsolute(filename) ? filename : resolve(projectDir, filename);
  const absDeploymentFilename = isAbsolute(deploymentFilename)
    ? deploymentFilename
    : resolve(projectDir, deploymentFilename);
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
  // Model and behavior policies use their own parameter schemas, never instance input schemas.
  const modelSchemas: JSONSchema7 = { type: "object", additionalProperties: false, properties: {} };
  const parameterSchema = (id: string, source?: JSONSchema7): JSONSchema7 => {
    if (!source) return { type: "object", additionalProperties: true };
    const prefix = `Parameters$${Buffer.from(id).toString("hex")}$`;
    const schema: JSONSchema7 = JSON.parse(
      JSON.stringify(source).replaceAll("#/definitions/", `#/definitions/${prefix}`)
    );
    for (const [name, definition] of Object.entries(schema.definitions ?? {})) {
      res.definitions[prefix + name] = definition;
    }
    delete schema.definitions;
    if (!full) delete schema.required;
    return schema;
  };
  const modules = app.getModules();
  for (const [id, metadata] of Object.entries(modules.models ?? {})) {
    const behaviors: JSONSchema7 = { type: "object", additionalProperties: false, properties: {} };
    for (const relation of metadata.Relations?.behaviors ?? []) {
      behaviors.properties[relation.attribute] = parameterSchema(
        `${id}/${relation.attribute}`,
        modules.behaviors?.[relation.behavior]?.Schema
      );
    }
    modelSchemas.properties[id] = {
      type: "object",
      additionalProperties: false,
      properties: { parameters: parameterSchema(id, metadata.Schema), behaviors }
    };
  }
  res.properties.models = modelSchemas;
  if (!existsSync(dirname(absFilename))) {
    mkdirSync(dirname(absFilename), { recursive: true });
  }
  FileUtils.save(res, absFilename);
  // Build the deployment schema
  // Ensure builtin deployers are there
  const definitions = JSONUtils.duplicate(res.definitions);
  res = {
    properties: {
      $schema: { type: "string" },
      parameters: {
        type: "object",
        additionalProperties: true
      },
      models: modelSchemas,
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
  if (!existsSync(dirname(absDeploymentFilename))) {
    mkdirSync(dirname(absDeploymentFilename), { recursive: true });
  }
  FileUtils.save(res, absDeploymentFilename);

  // Ensure $schema is set in the configuration file if not present
  if (configFile && existsSync(configFile)) {
    try {
      const config = FileUtils.load(configFile);
      if (config && typeof config === "object" && !Array.isArray(config) && !config.$schema) {
        const schemaRef = relative(dirname(resolve(configFile)), absFilename).replace(/\\/g, "/");
        const updated = { $schema: schemaRef, ...config };
        FileUtils.save(updated, configFile);
      }
    } catch {
      // Ignore unparseable configuration file
    }
  }

  // Ensure $schema is set in each deployment file if not present
  const targetDeploymentsDir = deploymentsDir
    ? resolve(projectDir, deploymentsDir)
    : configFile
      ? join(projectDir, "deployments")
      : undefined;
  if (targetDeploymentsDir && existsSync(targetDeploymentsDir)) {
    FileUtils.walkSync(targetDeploymentsDir, filePath => {
      if (filePath.endsWith(".json") || filePath.endsWith(".jsonc")) {
        try {
          const deployment = FileUtils.load(filePath);
          if (deployment && typeof deployment === "object" && !Array.isArray(deployment) && !deployment.$schema) {
            const schemaRef = relative(dirname(resolve(filePath)), absDeploymentFilename).replace(/\\/g, "/");
            const updated = { $schema: schemaRef, ...deployment };
            FileUtils.save(updated, filePath);
          }
        } catch {
          // Ignore unparseable deployment file
        }
      }
    });
  }
}
