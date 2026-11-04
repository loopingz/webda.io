import { loadModelLink } from "../models/polymorphic.js";
import {
  getTypeResolver,
  ModelTypeResolver,
  setTypeResolver,
  setModelLinkLoader,
  type ModelClass
} from "@webda/models";

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
  // Resolve the application and caller at read time, rather than capturing this application.
  setModelLinkLoader(reference => loadModelLink(reference));
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
 *
 * A type resolving to a strict ancestor of the table root is `legacy`, to be stamped with the root identifier: the
 * row belongs to the root like an untyped row.
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
  const rootIdentifier = tableRoot
    ? (resolver.getIdentifier(tableRoot) ?? (tableRoot as any).Metadata?.Identifier)
    : undefined;
  if (stored === undefined || stored === null || stored === "") {
    return rootIdentifier ? { kind: "untyped", from: UNTYPED, to: rootIdentifier } : { kind: "untyped", from: UNTYPED };
  }
  const from = String(stored);
  const resolution = resolver.resolve(from);
  if (resolution.status === "unknown") {
    return { kind: "unknown", from };
  }
  if (resolution.status === "ambiguous") {
    return { kind: "ambiguous", from, candidates: resolution.candidates };
  }
  if (rootIdentifier && (tableRoot as any).prototype instanceof (resolution.model as any)) {
    // A strict ancestor of the table root: the row belongs to the root, like an untyped row
    return { kind: "legacy", from, to: rootIdentifier };
  }
  return { kind: resolution.status, from, to: resolution.identifier };
}
