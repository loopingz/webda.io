import { getTypeResolver, ModelTypeResolver, setTypeResolver, type ModelClass } from "@webda/models";

/**
 * Label of a row without `__type` in reports
 */
export const UNTYPED = "(untyped)";
/**
 * Label of a row whose stored value cannot be parsed in reports
 */
export const UNREADABLE = "(unreadable)";

/**
 * What the resolver needs from an application
 */
export interface ModelTypesSource {
  /**
   * @returns models by identifier
   */
  getModels(): Record<string, any>;
  /**
   * @returns the application namespace
   */
  getNamespace(): string;
}

/**
 * Build the stored type resolver of an application
 * @param app - the application
 * @returns the resolver
 */
export function buildModelTypeResolver(app: ModelTypesSource): ModelTypeResolver {
  return new ModelTypeResolver(app.getModels(), { namespace: app.getNamespace() });
}

/**
 * Build and install the resolver of an application: repositories and stores resolve stored types with it
 * @param app - the application
 * @returns the installed resolver
 */
export function installModelTypes(app: ModelTypesSource): ModelTypeResolver {
  const resolver = buildModelTypeResolver(app);
  setTypeResolver(resolver);
  return resolver;
}

/**
 * Kind of a stored `__type`
 */
export type StoredTypeKind = "current" | "legacy" | "untyped" | "unknown" | "ambiguous";

/**
 * A stored `__type` and what it becomes
 */
export interface StoredTypeClassification {
  /** Kind of the stored value */
  kind: StoredTypeKind;
  /** The stored value, {@link UNTYPED} when absent */
  from: string;
  /** Identifier to store: for current, legacy, and untyped rows with a known table root */
  to?: string;
  /** Matched identifiers of an ambiguous value */
  candidates?: string[];
}

/**
 * Classify a stored `__type`
 * @param stored - the stored value (undefined, null or empty for an untyped row)
 * @param tableRoot - the model owning the untyped rows of the table
 * @param resolver - the resolver, the installed one by default
 * @returns the classification
 */
export function classifyStoredType(
  stored: unknown,
  tableRoot?: ModelClass,
  resolver: ModelTypeResolver = getTypeResolver()
): StoredTypeClassification {
  if (stored === undefined || stored === null || stored === "") {
    const to = tableRoot ? (resolver.getIdentifier(tableRoot) ?? (tableRoot as any).Metadata?.Identifier) : undefined;
    return to ? { kind: "untyped", from: UNTYPED, to } : { kind: "untyped", from: UNTYPED };
  }
  const from = String(stored);
  const resolution = resolver.resolve(from);
  if (resolution.status === "unknown") {
    return { kind: "unknown", from };
  }
  if (resolution.status === "ambiguous") {
    return { kind: "ambiguous", from, candidates: resolution.candidates };
  }
  return { kind: resolution.status, from, to: resolution.identifier };
}
