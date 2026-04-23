import { existsSync } from "node:fs";
import { FileUtils } from "./serializers.js";

/**
 * Enumerate the unique service types declared in a webda.config.jsonc file.
 *
 * Reads the configuration file, walks `services[*].type`, and applies the
 * same namespace-completion rule as `Application.completeNamespace` — a type
 * without a `/` is prefixed with the project namespace.
 *
 * Used by `webdac build` to decide whether to dispatch `webda build` without
 * needing to instantiate a full Webda runtime.
 * @param configPath - Absolute path to webda.config.json or .jsonc. Missing or unparseable files return `[]`.
 * @param namespace - Project namespace to prefix unqualified type names with.
 * @returns Deduplicated, stable-ordered array of fully-qualified service type names.
 */
export function listConfiguredServiceTypes(configPath: string, namespace: string): string[] {
  if (!existsSync(configPath)) return [];
  let config: any;
  try {
    config = FileUtils.load(configPath);
  } catch {
    return [];
  }
  const services = config?.services;
  if (!services || typeof services !== "object") return [];
  const types = new Set<string>();
  for (const svc of Object.values(services)) {
    const t = (svc as any)?.type;
    if (typeof t !== "string") continue;
    types.add(t.includes("/") ? t : `${namespace}/${t}`);
  }
  return [...types];
}
