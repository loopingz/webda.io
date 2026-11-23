import { FileUtils, JSONUtils } from "@webda/utils";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { WebdaModule, WebdaProject } from "./definition.js";
import { generateOperations } from "./operations.js";

/**
 * Severity level for Webda linter issues
 */
export type LintSeverity = "error" | "warn" | "info";

/**
 * A single diagnostic reported by the Webda linter
 */
export interface LintIssue {
  /**
   * Rule identifier (e.g. `config/no-deprecated-store-model`)
   */
  rule: string;
  /**
   * Diagnostic severity
   */
  severity: LintSeverity;
  /**
   * Human-readable explanation
   */
  message: string;
  /**
   * Relative or absolute file path where the issue was found
   */
  file?: string;
}

/**
 * Aggregated result from linting a Webda project
 */
export interface LintResult {
  /**
   * All collected issues
   */
  issues: LintIssue[];
  /**
   * Count of error-level issues
   */
  errors: number;
  /**
   * Count of warning-level issues
   */
  warnings: number;
  /**
   * Count of info-level issues
   */
  infos: number;
}

/**
 * Options for `lintProject`
 */
export interface LintOptions {
  /**
   * Treat warnings as errors in exit-code calculation
   */
  strict?: boolean;
}

/**
 * Scan a single `node_modules` directory for `webda.module.json` files
 * @param dir - the `node_modules` directory path
 * @param mod - the module object to merge into
 * @param seen - set of already-visited directories
 */
function scanNodeModules(dir: string, mod: WebdaModule, seen: Set<string>): void {
  if (!existsSync(dir)) return;
  const scan = (current: string, depth: number = 0) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(current, entry.name);
      if (entry.name.startsWith("@") && depth === 0) {
        scan(full, depth + 1);
        continue;
      }
      let target = full;
      if (entry.isSymbolicLink()) {
        try {
          target = realpathSync(full);
          if (!lstatSync(target).isDirectory()) continue;
        } catch {
          continue;
        }
      } else if (!entry.isDirectory()) {
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      const modFile = join(target, "webda.module.json");
      if (!existsSync(modFile)) continue;
      try {
        const depMod = FileUtils.load(modFile, "json") as WebdaModule;
        for (const section of ["moddas", "deployers", "schemas", "models"] as const) {
          if (depMod[section]) {
            (mod as any)[section] = { ...(mod as any)[section], ...depMod[section] };
          }
        }
        if (depMod.capabilities) {
          mod.capabilities = { ...depMod.capabilities, ...mod.capabilities };
        }
      } catch {
        // Skip invalid modules
      }
    }
  };
  scan(dir);
}

/**
 * Scan `node_modules` up the directory tree and merge dependency `webda.module.json` metadata
 * @param projectPath - the project root path
 * @param mod - the module object to merge into
 */
export function mergeDependencyModules(projectPath: string, mod: WebdaModule): void {
  const seen = new Set<string>();
  let current = resolve(projectPath);
  while (true) {
    scanNodeModules(join(current, "node_modules"), mod, seen);
    const parent = resolve(join(current, ".."));
    if (parent === current) break;
    current = parent;
  }
}

/**
 * Resolve a short Webda type/model name against a namespace and `Webda/` fallback
 * @param name - configured name (e.g. `MemoryStore` or `MyApp/User`)
 * @param namespace - application namespace
 * @param registry - map of known entries
 * @returns Matched full key or undefined
 */
function resolveQualifiedName(name: string, namespace: string, registry: Record<string, unknown>): string | undefined {
  if (name in registry) return name;
  if (!name.includes("/")) {
    const appKey = `${namespace}/${name}`;
    if (appKey in registry) return appKey;
    const webdaKey = `Webda/${name}`;
    if (webdaKey in registry) return webdaKey;
  }
  return undefined;
}

/**
 * Lint a Webda configuration object against a merged `WebdaModule`
 * @param mod - merged WebdaModule
 * @param config - parsed `webda.config.*` or deployment config object
 * @param file - display path for diagnostics
 * @param namespace - application namespace (defaults to `Webda`)
 * @param isDeploymentOverride - whether the config is a partial deployment override file
 * @returns List of config-level lint issues
 */
export function lintConfiguration(
  mod: WebdaModule,
  config: any,
  file?: string,
  namespace: string = "Webda",
  isDeploymentOverride: boolean = false
): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!config || typeof config !== "object" || !config.services || typeof config.services !== "object") {
    return issues;
  }

  const knownServices: Record<string, unknown> = {
    ...(mod.moddas || {}),
    ...(mod.beans || {})
  };
  const hasModdasLoaded = Boolean(mod.moddas && "Webda/MemoryStore" in mod.moddas);

  for (const [serviceName, serviceConfig] of Object.entries<any>(config.services)) {
    if (!serviceConfig || typeof serviceConfig !== "object") {
      continue;
    }

    // Check deprecated `model` / `additionalModels`
    if ("model" in serviceConfig || "additionalModels" in serviceConfig) {
      issues.push({
        rule: "config/no-deprecated-store-model",
        severity: "error",
        file,
        message: `Service '${serviceName}' uses deprecated 'model'/'additionalModels'; migrate to 'models: [...]'`
      });
    }

    const svcType: string | undefined = serviceConfig.type;
    if (svcType) {
      const resolvedType = resolveQualifiedName(svcType, namespace, knownServices);
      if (!resolvedType && hasModdasLoaded) {
        issues.push({
          rule: "config/unknown-service-type",
          severity: "warn",
          file,
          message: `Service '${serviceName}' references unknown type '${svcType}'`
        });
      }

      if (!isDeploymentOverride && svcType.endsWith("Store") && serviceName !== "Registry") {
        const models = serviceConfig.models;
        if (!Array.isArray(models) || models.length === 0) {
          issues.push({
            rule: "config/store-missing-models",
            severity: "warn",
            file,
            message: `Store service '${serviceName}' (${svcType}) has no 'models' array configured`
          });
        }
      }
    }

    if (Array.isArray(serviceConfig.models) && mod.models && Object.keys(mod.models).length > 0) {
      for (const modelRef of serviceConfig.models) {
        if (typeof modelRef !== "string") continue;
        if (!resolveQualifiedName(modelRef, namespace, mod.models)) {
          issues.push({
            rule: "config/unknown-model-reference",
            severity: "error",
            file,
            message: `Service '${serviceName}' references unknown model '${modelRef}'`
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Lint a `WebdaModule` (models, operations, and service schemas)
 * @param localMod - the project's own `webda.module.json`
 * @param mergedMod - the merged `WebdaModule` including dependencies
 * @param config - optional main `webda.config.*` object for cross-referencing models
 * @param namespace - application namespace
 * @returns List of module-level lint issues
 */
export function lintModule(
  localMod: WebdaModule,
  mergedMod: WebdaModule,
  config?: any,
  namespace: string = "Webda"
): LintIssue[] {
  const issues: LintIssue[] = [];

  // Check orphan models (defined in local module but not attached to any configured Store)
  if (localMod.models && config?.services) {
    const attachedModels = new Set<string>();
    for (const svc of Object.values<any>(config.services)) {
      if (svc && Array.isArray(svc.models)) {
        for (const m of svc.models) {
          if (typeof m === "string") {
            const resolved = resolveQualifiedName(m, namespace, mergedMod.models || {}) || m;
            attachedModels.add(resolved);
          }
        }
      }
    }
    for (const modelKey of Object.keys(localMod.models)) {
      if (!attachedModels.has(modelKey)) {
        issues.push({
          rule: "module/orphan-model",
          severity: "warn",
          file: "webda.module.json",
          message: `Model '${modelKey}' is not attached to any Store in configuration`
        });
      }
    }
  }

  // Check generated operations for untyped schemas
  try {
    const ops = generateOperations(mergedMod);
    for (const [opId, op] of Object.entries(ops.operations)) {
      const inputSchema = ops.schemas[op.input!];
      if (inputSchema && inputSchema.type === "object" && !inputSchema.properties && !inputSchema.$ref) {
        issues.push({
          rule: "module/untyped-operation",
          severity: "info",
          file: "webda.module.json",
          message: `Operation '${opId}' has an untyped object input schema ('${op.input}')`
        });
      }
    }
  } catch {
    // Skip operation checks if module is incomplete
  }

  // Check local moddas/beans for missing configuration schemas
  for (const section of ["moddas", "beans"] as const) {
    const entries = localMod[section];
    if (!entries) continue;
    for (const [key, meta] of Object.entries<any>(entries)) {
      if (!meta?.Schema && !mergedMod.schemas?.[key]) {
        issues.push({
          rule: "module/service-missing-schema",
          severity: "info",
          file: "webda.module.json",
          message: `Service '${key}' has no configuration parameter schema`
        });
      }
    }
  }

  return issues;
}

/**
 * Run all Webda project-level lint checks on a directory
 * @param projectPath - path to the Webda project root
 * @returns Aggregated `LintResult`
 */
export function lintProject(projectPath: string): LintResult {
  const root = resolve(projectPath);
  const issues: LintIssue[] = [];

  let namespace = "Webda";
  try {
    const project = new WebdaProject(root);
    namespace = project.namespace;
  } catch {
    // Allow linting even without a complete package.json
  }

  const modulePath = join(root, "webda.module.json");
  let localMod: WebdaModule = { moddas: {}, models: {}, deployers: {}, beans: {}, schemas: {} };
  let mergedMod: WebdaModule = { moddas: {}, models: {}, deployers: {}, beans: {}, schemas: {} };

  if (existsSync(modulePath)) {
    localMod = FileUtils.load(modulePath, "json") as WebdaModule;
    mergedMod = JSONUtils.duplicate(localMod);
    mergeDependencyModules(root, mergedMod);
  } else {
    issues.push({
      rule: "project/missing-module",
      severity: "warn",
      message: "webda.module.json not found; run `webdac build` first for full model/operation checks"
    });
  }

  let mainConfig: any;
  try {
    const configPath = FileUtils.getConfigurationFile(join(root, "webda.config"));
    if (configPath && existsSync(configPath)) {
      mainConfig = FileUtils.load(configPath);
      issues.push(
        ...lintConfiguration(mergedMod, mainConfig, relative(root, configPath).split(sep).join("/"), namespace)
      );
    }
  } catch {
    // No webda.config.* found (e.g. library package)
  }

  // Also lint deployment configs if present
  const deploymentsDir = join(root, "deployments");
  if (existsSync(deploymentsDir)) {
    for (const entry of readdirSync(deploymentsDir)) {
      if (!/\.(json|jsonc|ya?ml)$/.test(entry)) continue;
      const depPath = join(deploymentsDir, entry);
      try {
        const depConfig = FileUtils.load(depPath);
        issues.push(
          ...lintConfiguration(mergedMod, depConfig, relative(root, depPath).split(sep).join("/"), namespace, true)
        );
      } catch {
        // Ignore unparseable files
      }
    }
  }

  if (existsSync(modulePath)) {
    issues.push(...lintModule(localMod, mergedMod, mainConfig, namespace));
  }

  return {
    issues,
    errors: issues.filter(i => i.severity === "error").length,
    warnings: issues.filter(i => i.severity === "warn").length,
    infos: issues.filter(i => i.severity === "info").length
  };
}
