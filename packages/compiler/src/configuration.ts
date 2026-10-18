import { FileUtils, JSONUtils } from "@webda/utils";
import { JSONSchema7 } from "json-schema";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep, resolve, isAbsolute } from "node:path";

/**
 * File extensions of configuration and deployment files
 */
const CONFIGURATION_EXTENSIONS = [".json", ".jsonc", ".yaml", ".yml"];

/**
 * Schema references written by previous versions of webda, they are considered managed by webda
 */
const LEGACY_SCHEMA_REFERENCES = [".webda-config-schema.json", ".webda-deployment-schema.json"];

/**
 * YAML modeline understood by the YAML language server (VSCode, IntelliJ, ...)
 *
 * YAML has no `$schema` keyword, so the reference is written as a comment
 */
const YAML_MODELINE = /^#\s*yaml-language-server:\s*\$schema=(\S*).*$/m;

/**
 * Leading whitespaces and comments of a JSON/JSONC document up to its root object
 */
const JSON_ROOT_OBJECT = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*\{/;

/**
 * First `$schema` property of a JSON/JSONC document, webda keeps it as first property of the root
 */
const JSON_SCHEMA_PROPERTY = /("\$schema"\s*:\s*)"(?:[^"\\]|\\.)*"/;

/**
 * Check if a schema reference is managed by webda and can be updated
 *
 * A reference is managed if it targets the generated schema or a legacy webda schema,
 * any other reference (remote url, custom schema) is left untouched.
 *
 * @param current - the current reference
 * @param schemaFile - the generated schema file
 * @returns true if the reference can be replaced
 */
function isManagedSchemaReference(current: string, schemaFile: string): boolean {
  const name = basename(current);
  return name === basename(schemaFile) || LEGACY_SCHEMA_REFERENCES.includes(name);
}

/**
 * Ensure a configuration or deployment file references its JSON schema
 *
 * - JSON/JSONC: the `$schema` property is added as first property, formatting and comments are kept
 * - YAML: a `# yaml-language-server: $schema=...` modeline is added on the first line
 *
 * The reference is relative to the file. An existing reference is only replaced if it is
 * managed by webda (stale path or legacy name), custom references are kept.
 *
 * @param file - the configuration or deployment file
 * @param schemaFile - the schema file to reference
 * @returns true if the file was updated
 */
export function ensureSchemaReference(file: string, schemaFile: string): boolean {
  const reference = relative(dirname(file), schemaFile).split(sep).join("/");
  if (/\.ya?ml$/.test(file)) {
    const content = readFileSync(file, "utf-8");
    const match = YAML_MODELINE.exec(content);
    if (!match) {
      writeFileSync(file, `# yaml-language-server: $schema=${reference}\n${content}`);
      return true;
    }
    if (match[1] === reference || !isManagedSchemaReference(match[1], schemaFile)) {
      return false;
    }
    writeFileSync(file, content.replace(YAML_MODELINE, `# yaml-language-server: $schema=${reference}`));
    return true;
  }
  const content = readFileSync(file, "utf-8");
  let parsed: any;
  try {
    parsed = JSONUtils.parse(content);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.$schema === reference) {
    return false;
  }
  if (parsed.$schema !== undefined) {
    if (typeof parsed.$schema !== "string" || !isManagedSchemaReference(parsed.$schema, schemaFile)) {
      return false;
    }
    writeFileSync(file, content.replace(JSON_SCHEMA_PROPERTY, `$1${JSON.stringify(reference)}`));
    return true;
  }
  writeFileSync(file, insertSchemaProperty(content, reference));
  return true;
}

/**
 * Insert a `$schema` property as first property of a JSON/JSONC document
 *
 * The document is edited as text, so formatting and comments are kept as is
 *
 * @param content - the JSON/JSONC document, its root must be an object
 * @param reference - the schema reference
 * @returns the updated document
 */
function insertSchemaProperty(content: string, reference: string): string {
  // Skip leading whitespaces and comments to find the root object
  const start = JSON_ROOT_OBJECT.exec(content)[0].length;
  const after = content.substring(start);
  const property = `"$schema": ${JSON.stringify(reference)}`;
  // Empty object
  if (/^\s*}/.test(after)) {
    return `${content.substring(0, start)} ${property} ${after.trimStart()}`;
  }
  // Multiline object: reuse the indentation of the first property
  const multiline = /^[ \t]*\r?\n(\s*?)([ \t]*)\S/.exec(after);
  if (multiline) {
    const eol = after.includes("\r\n") ? "\r\n" : "\n";
    return `${content.substring(0, start)}${eol}${multiline[2]}${property},${after}`;
  }
  return `${content.substring(0, start)}${property},${after}`;
}

/**
 * List the deployment files of a deployments folder
 *
 * @param deploymentsDir - the `deployments` folder
 * @returns the deployment files, empty if the folder does not exist
 */
export function listDeploymentFiles(deploymentsDir: string): string[] {
  if (!existsSync(deploymentsDir)) {
    return [];
  }
  return readdirSync(deploymentsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && CONFIGURATION_EXTENSIONS.some(ext => entry.name.endsWith(ext)))
    .map(entry => join(deploymentsDir, entry.name))
    .sort();
}

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
 * @param deploymentsDir - optional deployments folder, each deployment file gets its $schema reference
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
    type: "object",
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

  if (configFile) {
    ensureSchemaReference(configFile, absFilename);
  }
  const targetDeploymentsDir = deploymentsDir
    ? resolve(projectDir, deploymentsDir)
    : configFile
      ? join(projectDir, "deployments")
      : undefined;
  if (targetDeploymentsDir && existsSync(targetDeploymentsDir)) {
    FileUtils.walkSync(targetDeploymentsDir, filePath => {
      if (CONFIGURATION_EXTENSIONS.some(ext => filePath.endsWith(ext))) {
        ensureSchemaReference(filePath, absDeploymentFilename);
      }
    });
  }
}
