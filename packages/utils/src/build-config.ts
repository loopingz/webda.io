import { existsSync } from "node:fs";
import { useLog } from "@webda/workout";
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
  } catch (err) {
    // The file exists (we checked above), so reaching this path means the
    // config failed to parse. Surface it as a warning — silently returning
    // `[]` would make `webdac build` skip build-hook dispatch without any
    // explanation when a user introduces a JSON/JSONC typo.
    useLog("WARN", `listConfiguredServiceTypes: cannot parse ${configPath}: ${(err as Error).message}`);
    return [];
  }
  const services = config?.services;
  if (!services || typeof services !== "object" || Array.isArray(services)) return [];
  const types = new Set<string>();
  for (const svc of Object.values(services)) {
    const t = (svc as any)?.type;
    if (typeof t !== "string") continue;
    types.add(t.includes("/") ? t : `${namespace}/${t}`);
  }
  return [...types];
}
