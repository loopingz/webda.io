import type { JSONSchema7 } from "json-schema";
import { getDeploymentUnitServices, type DeploymentUnit } from "../application/deployment.js";

/**
 * JSON Schema keyword marking a configuration value that must be encrypted
 *
 * Written by the compiler for a property typed with `SecretString` or tagged `@secret`:
 * - `true`: the whole value, every string below it
 * - a list of names: only these children of the object, a name can be a dotted path
 *   and the arrays on the way are traversed (`users.token`)
 */
export const SECRET_KEYWORD = "x-webda-secret";

/**
 * Encrypter of the values kept in clear text on purpose: `crypt:none:<value>`
 */
export const OPT_OUT_ENCRYPTER = "none";

/**
 * A secret configuration value that is not encrypted
 *
 * It never holds the value itself.
 */
export interface SecretFinding {
  /**
   * Configuration path of the value, like `services.db.postgresqlServer.password`
   */
  path: string;
  /**
   * Location of the value in the checked configuration object, like `["units", 0, "apiKey"]`
   */
  location?: (string | number)[];
  /**
   * Service or deployment unit name
   */
  service?: string;
  /**
   * Service type
   */
  type?: string;
  /**
   * - `plain`: written in clear text
   * - `marked`: still `encrypt:` or `sencrypt:`, run `webda config encrypt`
   * - `opted-out`: kept in clear text on purpose with `crypt:none:` or `scrypt:none:`
   */
  reason: "plain" | "marked" | "opted-out";
}

/**
 * A finding with its path still split in segments
 */
interface RawFinding {
  path: (string | number)[];
  reason: SecretFinding["reason"];
}

/**
 * Limit of `$ref` followed without going down the value, protects from a reference cycle
 */
const MAX_REF_DEPTH = 32;

/**
 * Check if a value is a plain object, class instances are not
 * @param value - the value to test
 * @returns true for a plain object
 */
function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Format a configuration path: `services.db.keys[0]`
 * @param path - the path segments
 * @returns the formatted path
 */
export function formatSecretPath(path: (string | number)[]): string {
  return path.reduce<string>((res, segment) => {
    if (typeof segment === "number") {
      return `${res}[${segment}]`;
    }
    return res ? `${res}.${segment}` : segment;
  }, "");
}

/**
 * Classify a secret value
 *
 * `crypt:` and `scrypt:` values are encrypted, except the opted-out `crypt:none:` ones. Unset values (`""`,
 * `null`, `undefined`) are allowed: the service then falls back to its environment.
 *
 * @param value - the secret value
 * @returns the reason it fails, or undefined when it is fine
 */
function classify(value: any): SecretFinding["reason"] | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  if (value.startsWith(`crypt:${OPT_OUT_ENCRYPTER}:`) || value.startsWith(`scrypt:${OPT_OUT_ENCRYPTER}:`)) {
    return "opted-out";
  }
  if (/^s?crypt:/.test(value)) {
    return undefined;
  }
  return /^s?encrypt:/.test(value) ? "marked" : "plain";
}

/**
 * Check a secret value: a string, or every string below an object or an array
 * @param value - the secret value
 * @param path - its path
 * @param findings - collected findings
 */
function checkLeaves(value: any, path: (string | number)[], findings: RawFinding[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkLeaves(item, [...path, index], findings));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      checkLeaves(item, [...path, key], findings);
    }
    return;
  }
  const reason = classify(value);
  if (reason) {
    findings.push({ path, reason });
  }
}

/**
 * Check the children of a value listed by a scoped secret marker
 * @param value - the value holding the children
 * @param segments - the remaining segments of the child name
 * @param path - path of the value
 * @param findings - collected findings
 */
function checkScoped(value: any, segments: string[], path: (string | number)[], findings: RawFinding[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkScoped(item, segments, [...path, index], findings));
    return;
  }
  if (segments.length === 0) {
    checkLeaves(value, path, findings);
    return;
  }
  // A string where an object is expected (a file path for example) holds no listed child
  if (isPlainObject(value) && value[segments[0]] !== undefined) {
    checkScoped(value[segments[0]], segments.slice(1), [...path, segments[0]], findings);
  }
}

/**
 * Resolve a `#/definitions/...` reference
 * @param ref - the reference
 * @param root - the document holding the definitions
 * @returns the referenced schema
 */
function resolveRef(ref: string, root: JSONSchema7): JSONSchema7 | undefined {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  let target: any = root;
  for (const segment of ref.substring(2).split("/")) {
    target = target?.[decodeURIComponent(segment).replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return typeof target === "object" ? target : undefined;
}

/**
 * Walk a value with its schema and collect the secrets that are not encrypted
 * @param value - the value
 * @param schema - its schema
 * @param root - the document, for `$ref`
 * @param path - path of the value
 * @param findings - collected findings
 * @param refDepth - `$ref` followed since the value last changed
 */
function walk(
  value: any,
  schema: JSONSchema7 | boolean | undefined,
  root: JSONSchema7,
  path: (string | number)[],
  findings: RawFinding[],
  refDepth: number = 0
): void {
  if (value === undefined || value === null || !schema || typeof schema !== "object") {
    return;
  }
  const marker = (schema as JSONSchema7 & { [SECRET_KEYWORD]?: unknown })[SECRET_KEYWORD];
  if (marker === true) {
    checkLeaves(value, path, findings);
    return;
  }
  if (Array.isArray(marker)) {
    for (const name of marker) {
      checkScoped(value, String(name).split("."), path, findings);
    }
  }
  if (schema.$ref && refDepth < MAX_REF_DEPTH) {
    walk(value, resolveRef(schema.$ref, root), root, path, findings, refDepth + 1);
  }
  for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])]) {
    walk(value, branch, root, path, findings, refDepth + 1);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const items = Array.isArray(schema.items) ? schema.items[index] : schema.items;
      walk(item, items, root, [...path, index], findings);
    });
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key] ?? schema.additionalProperties;
      walk(item, child, root, [...path, key], findings);
    }
  }
}

/**
 * Collect the secrets of a value that are not encrypted, with their path in segments
 * @param value - the value
 * @param schema - its schema
 * @param root - the document, for `$ref`
 * @param path - path of the value
 * @returns the findings, each path once
 */
function collect(
  value: any,
  schema: JSONSchema7,
  root: JSONSchema7 = schema,
  path: (string | number)[] = []
): RawFinding[] {
  const findings: RawFinding[] = [];
  walk(value, schema, root, path, findings);
  // A value can be reached through several branches or markers
  const seen = new Set<string>();
  return findings.filter(finding => {
    const key = JSON.stringify(finding.path);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Find the secrets of a value that are not encrypted
 *
 * A schema node marked {@link SECRET_KEYWORD} must hold a `crypt:` or `scrypt:` string, or nothing.
 * The findings never contain the values.
 *
 * @param value - the value, a service configuration for example
 * @param schema - its schema
 * @param root - the document holding the definitions, for `$ref`
 * @param path - path of the value, prefixed to the findings
 * @returns the findings
 */
export function findUnencryptedSecrets(
  value: any,
  schema: JSONSchema7,
  root: JSONSchema7 = schema,
  path: (string | number)[] = []
): SecretFinding[] {
  return collect(value, schema, root, path).map(({ path, reason }) => ({ path: formatSecretPath(path), reason }));
}

/**
 * Parse the patterns of the secret paths to exclude
 *
 * A pattern uses the path syntax of the findings, `$.` prefix optional: `*` matches one name or index
 * (`units[*].auth.pass`), `**` matches anything, and a pattern also excludes the values below it
 * (`services.demo`).
 *
 * @param patterns - the patterns, a comma-separated string or a list
 * @returns a function telling whether a finding path is excluded
 */
export function secretPathExcluder(patterns: string | string[] = []): (path: string) => boolean {
  const list = (typeof patterns === "string" ? patterns.split(",") : patterns)
    .map(pattern => pattern.trim().replace(/^\$\.?/, ""))
    .filter(pattern => pattern !== "");
  const expressions = list.map(pattern => {
    let source = "";
    for (let i = 0; i < pattern.length; i++) {
      if (pattern.startsWith("**", i)) {
        source += ".*";
        i++;
      } else if (pattern[i] === "*") {
        source += "[^.\\[\\]]+";
      } else {
        source += pattern[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      }
    }
    return new RegExp(`^${source}(?:[.[].*)?$`);
  });
  return path => expressions.some(expression => expression.test(path));
}

/**
 * Check if a structure holds a value at a path
 * @param data - the structure
 * @param path - the path
 * @returns true when the value is defined
 */
function hasPath(data: any, path: (string | number)[]): boolean {
  let target = data;
  for (const segment of path) {
    if (target === null || typeof target !== "object" || target[segment] === undefined) {
      return false;
    }
    target = target[segment];
  }
  return true;
}

/**
 * Configuration to check: an application configuration, a deployment, or both merged
 */
export interface SecretsCheckConfiguration {
  /**
   * Services configuration
   */
  services?: Record<string, any>;
  /**
   * Global parameters, merged into every service
   */
  parameters?: Record<string, any>;
  /**
   * Parameters shared by the deployment units
   */
  resources?: Record<string, any>;
  /**
   * Deployment units
   */
  units?: DeploymentUnit[];
}

/**
 * Find the unencrypted secrets of a configuration
 *
 * Each service is checked against the schema of its type, with the global parameters it inherits:
 * a secret written in `parameters` is reported once, under `parameters`. The deployment units are
 * checked with the `resources` they inherit, reported under `resources`.
 *
 * @param configuration - the configuration to check
 * @param options - how to find the schemas
 * @param options.getSchema - the schema of a service type
 * @param options.completeNamespace - add the namespace to a service type
 * @param options.getType - the type of a service without one, from the application configuration
 * @param options.inheritingServices - other services inheriting `parameters`, defined in another file
 * @returns the findings, and the service types without schema
 */
export function findConfigurationSecrets(
  configuration: SecretsCheckConfiguration,
  options: {
    getSchema: (type: string) => JSONSchema7 | undefined;
    completeNamespace?: (type: string) => string;
    getType?: (service: string) => string | undefined;
    inheritingServices?: Record<string, any>;
  }
): { findings: SecretFinding[]; unknownTypes: string[] } {
  const completeNamespace = options.completeNamespace ?? (type => type);
  const findings: SecretFinding[] = [];
  const unknownTypes = new Set<string>();
  const reported = new Set<string>();
  const report = (finding: SecretFinding) => {
    if (reported.has(finding.path)) return;
    reported.add(finding.path);
    findings.push(finding);
  };
  const check = (
    name: string,
    type: string,
    own: Record<string, any>,
    merged: Record<string, any>,
    ownLocation: (string | number)[],
    ownPrefix: (string | number)[],
    inheritedPrefix: string
  ) => {
    const schema = options.getSchema(type);
    if (!schema) {
      unknownTypes.add(type);
      return;
    }
    for (const { path, reason } of collect(merged, schema)) {
      const inherited = !hasPath(own, path);
      report({
        path: formatSecretPath([...(inherited ? [inheritedPrefix] : ownPrefix), ...path]),
        location: [...(inherited ? [inheritedPrefix] : ownLocation), ...path],
        service: name,
        type,
        reason
      });
    }
  };

  const parameters = configuration.parameters ?? {};
  const services = configuration.services ?? {};
  for (const [name, service] of Object.entries(services)) {
    if (!isPlainObject(service)) continue;
    const type = completeNamespace(service.type ?? options.getType?.(name) ?? name);
    check(name, type, service, { ...parameters, ...service }, ["services", name], ["services", name], "parameters");
  }
  // The parameters also reach the services of the other files, unless they set the same key
  for (const [name, service] of Object.entries(options.inheritingServices ?? {})) {
    if (!isPlainObject(service) || services[name] !== undefined) continue;
    const type = completeNamespace(service.type ?? name);
    const inherited = Object.fromEntries(Object.entries(parameters).filter(([key]) => service[key] === undefined));
    check(name, type, {}, inherited, ["services", name], ["services", name], "parameters");
  }

  const units = configuration.units ?? [];
  if (units.length) {
    const merged = getDeploymentUnitServices({ units, resources: configuration.resources }, completeNamespace);
    units.forEach((unit, index) => {
      const { name, type: _type, ...own } = unit;
      const { type, ...service } = merged[name];
      check(name, type, own, service, ["units", index], [`units[${name}]`], "resources");
    });
  }
  return { findings, unknownTypes: [...unknownTypes] };
}
