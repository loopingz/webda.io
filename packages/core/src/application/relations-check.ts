import { useLog } from "@webda/workout";

/**
 * Diagnostic severity level
 */
export type DiagnosticLevel = "DEBUG" | "INFO" | "WARN";

/**
 * Diagnostic code identifying the rule
 */
export type DiagnosticCode = "R1" | "R2" | "R3" | "R4" | "R5";

/**
 * Diagnostic result from relations check
 */
export interface RelationDiagnostic {
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  sourceModel: string;
  sourceAttribute: string;
  targetModel: string;
  targetAttribute?: string;
}

/**
 * Options for relations validation
 */
export interface RelationsCheckOptions {
  /**
   * Determine if a model is the final model in the current application namespace.
   * Defaults to true if omitted.
   */
  isFinalModel?: (modelId: string) => boolean;

  /**
   * Resolve a model ID to its backing store object.
   * When provided, store routing is checked:
   * - If store(M) === store(A), diagnostic is R4 (level: "INFO").
   * - If store(M) !== store(A), diagnostic is R5 (level: "WARN").
   */
  getStore?: (modelId: string) => any;

  /**
   * Return human-readable name of the store
   */
  getStoreName?: (store: any) => string;

  /**
   * When true and getStore is not provided, defer R4/R5 until store routing is available.
   */
  deferStoreCheck?: boolean;

  /**
   * When true and getStore is not provided, emit R4 as WARN.
   * Useful for static analysis / unit tests without Core or stores.
   */
  staticOnly?: boolean;
}

/**
 * Deduplication cache of logged diagnostics
 */
const loggedDiagnosticKeys = new Set<string>();

/**
 * Clear the deduplication cache (useful for tests)
 */
export function clearLoggedDiagnostics(): void {
  loggedDiagnosticKeys.clear();
}

/**
 * Log a relation diagnostic if not already logged
 * @param diagnostic - the diagnostic to log
 */
export function logDiagnostic(diagnostic: RelationDiagnostic): void {
  const key = `${diagnostic.code}:${diagnostic.sourceModel}:${diagnostic.sourceAttribute}:${diagnostic.targetModel}:${diagnostic.targetAttribute || ""}`;
  if (loggedDiagnosticKeys.has(key)) {
    return;
  }
  loggedDiagnosticKeys.add(key);
  useLog(diagnostic.level, diagnostic.message);
}

/**
 * Helper to extract metadata from model class or metadata object
 * @param model - model class or metadata
 * @returns ModelMetadata-like object
 */
function getMetadata(model: any): any {
  if (!model) return undefined;
  return model.Metadata || model;
}

/**
 * Helper to extract string identifier from model or metadata
 * @param model - model or metadata
 * @param fallback - fallback identifier
 * @returns string model ID
 */
function getModelId(model: any, fallback: string = ""): string {
  if (typeof model === "string") return model;
  const meta = getMetadata(model);
  return meta?.Identifier || fallback;
}

/**
 * Extract ancestor model IDs as an array of strings
 * @param meta - model metadata
 * @returns array of ancestor model IDs
 */
function getAncestorIds(meta: any): string[] {
  if (!meta?.Ancestors || !Array.isArray(meta.Ancestors)) return [];
  return meta.Ancestors.map((a: any) => getModelId(a)).filter(Boolean);
}

/**
 * Look up reverse relation attribute on target model or its ancestors
 * @param targetModelId - target model ID
 * @param targetAttr - attribute name to find
 * @param models - models dictionary
 * @returns matching relation info or undefined
 */
function findReverseRelation(
  targetModelId: string,
  targetAttr: string,
  models: Record<string, any>
): { kind: "link" | "parent"; model?: string } | undefined {
  const meta = getMetadata(models[targetModelId]);
  // The caller has already checked that the target model is loaded.

  // Check target model itself
  if (meta.Relations?.parent && meta.Relations.parent.attribute === targetAttr) {
    return { kind: "parent", model: getModelId(meta.Relations.parent.model) };
  }
  if (Array.isArray(meta.Relations?.links)) {
    const found = meta.Relations.links.find((l: any) => l.attribute === targetAttr);
    if (found) {
      return { kind: "link", model: found.model ? getModelId(found.model) : undefined };
    }
  }

  // Check ancestors
  const ancestorIds = getAncestorIds(meta);
  for (const ancId of ancestorIds) {
    const ancMeta = getMetadata(models[ancId]);
    if (!ancMeta) continue;
    if (ancMeta.Relations?.parent && ancMeta.Relations.parent.attribute === targetAttr) {
      return { kind: "parent", model: getModelId(ancMeta.Relations.parent.model) };
    }
    if (Array.isArray(ancMeta.Relations?.links)) {
      const found = ancMeta.Relations.links.find((l: any) => l.attribute === targetAttr);
      if (found) {
        return { kind: "link", model: found.model ? getModelId(found.model) : undefined };
      }
    }
  }

  return undefined;
}

/**
 * Validate symmetry of model relations and store routing
 * @param models - dictionary of models / metadata
 * @param options - validation options
 * @returns array of relation diagnostics
 */
export function checkRelations(models: Record<string, any>, options: RelationsCheckOptions = {}): RelationDiagnostic[] {
  const diagnostics: RelationDiagnostic[] = [];
  const isFinalModel = options.isFinalModel ?? (() => true);
  const getStoreName =
    options.getStoreName ??
    ((store: any) => {
      if (!store) return "Registry";
      return typeof store.getName === "function" ? store.getName() : String(store);
    });

  for (const [modelKey, modelEntry] of Object.entries(models)) {
    const metaA = getMetadata(modelEntry);
    if (!metaA) continue;
    const idA = metaA.Identifier || modelKey;
    const ancestorsA = getAncestorIds(metaA);

    // Collect queries and maps to check
    // We collect direct queries/maps and any inherited from ancestors that aren't overridden
    const queriesMap = new Map<string, { model: string; targetAttribute?: string }>();
    const mapsMap = new Map<string, { model: string; targetLink?: string }>();

    // Start with ancestors from root down to idA so subclass overrides win
    const hierarchy = [...ancestorsA].reverse();
    for (const ancId of hierarchy) {
      const ancMeta = getMetadata(models[ancId]);
      if (!ancMeta?.Relations) continue;
      for (const q of ancMeta.Relations.queries ?? []) {
        if (q.attribute) {
          queriesMap.set(q.attribute, { model: getModelId(q.model), targetAttribute: q.targetAttribute });
        }
      }
      for (const m of ancMeta.Relations.maps ?? []) {
        if (m.attribute) {
          mapsMap.set(m.attribute, { model: getModelId(m.model), targetLink: m.targetLink });
        }
      }
    }

    // Now own relations
    if (metaA.Relations) {
      for (const q of metaA.Relations.queries ?? []) {
        if (q.attribute) {
          queriesMap.set(q.attribute, { model: getModelId(q.model), targetAttribute: q.targetAttribute });
        }
      }
      for (const m of metaA.Relations.maps ?? []) {
        if (m.attribute) {
          mapsMap.set(m.attribute, { model: getModelId(m.model), targetLink: m.targetLink });
        }
      }
    }

    // Combine relation descriptors: [{ attr, targetModel, targetAttr }]
    const relationEntries: { attr: string; targetModel: string; targetAttr?: string }[] = [];
    for (const [attr, q] of queriesMap.entries()) {
      relationEntries.push({ attr, targetModel: q.model, targetAttr: q.targetAttribute });
    }
    for (const [attr, m] of mapsMap.entries()) {
      relationEntries.push({ attr, targetModel: m.model, targetAttr: m.targetLink });
    }

    for (const rel of relationEntries) {
      const { attr, targetModel: B, targetAttr: K } = rel;

      // R1: K is empty (e.g. ModelRelated<Brand, Hardware>)
      if (!K || K === "") {
        diagnostics.push({
          level: "DEBUG",
          code: "R1",
          sourceModel: idA,
          sourceAttribute: attr,
          targetModel: B,
          targetAttribute: K,
          message: `Cannot verify reverse relation for ${idA}.${attr}: no target attribute specified on ${B}`
        });
        continue;
      }

      // Check if B exists in models
      const metaB = getMetadata(models[B]);
      if (!metaB) {
        // Target model not loaded, cannot verify
        continue;
      }

      // Find reverse relation K on B or its ancestors
      const reverseRel = findReverseRelation(B, K, models);

      // R2: B (with ancestors) has no links/parent entry named K
      if (!reverseRel) {
        diagnostics.push({
          level: "WARN",
          code: "R2",
          sourceModel: idA,
          sourceAttribute: attr,
          targetModel: B,
          targetAttribute: K,
          message: `${idA}.${attr} targets ${B}.${K}, but ${B} (and its ancestors) has no link or parent named "${K}".`
        });
        continue;
      }

      const M = reverseRel.model;
      if (!M) {
        // Reverse relation exists but target model is unresolved (e.g. generic link)
        continue;
      }

      // If M === idA: fully symmetric, valid
      if (M === idA) {
        continue;
      }

      // R3: M is neither A nor an ancestor of A
      if (!ancestorsA.includes(M)) {
        diagnostics.push({
          level: "WARN",
          code: "R3",
          sourceModel: idA,
          sourceAttribute: attr,
          targetModel: B,
          targetAttribute: K,
          message: `${idA}.${attr} targets ${B}.${K}, but ${B}.${K} references unrelated model ${M} instead of ${idA}.`
        });
        continue;
      }

      // M is a strict ancestor of A: check if A is the final model
      if (!isFinalModel(idA)) {
        continue;
      }

      // A is the final model and M is a strict ancestor
      if (options.deferStoreCheck) {
        // Deferred until computeStores()
        continue;
      }

      if (options.getStore) {
        const storeA = options.getStore(idA);
        const storeM = options.getStore(M);
        const nameA = getStoreName(storeA);
        const nameM = getStoreName(storeM);

        if (storeA === storeM) {
          // R4: same store
          diagnostics.push({
            level: "INFO",
            code: "R4",
            sourceModel: idA,
            sourceAttribute: attr,
            targetModel: B,
            targetAttribute: K,
            message: `${idA}.${attr} expects ${B}.${K} to reference ${idA}, but it references ${M} (same store: ${nameA}). Loading works through stored type information.`
          });
        } else {
          // R5: different stores
          diagnostics.push({
            level: "WARN",
            code: "R5",
            sourceModel: idA,
            sourceAttribute: attr,
            targetModel: B,
            targetAttribute: K,
            message: `${idA}.${attr} expects ${B}.${K} to reference ${idA}, but it references ${M} (stores: ${nameA} vs ${nameM}). Override \`${K}: ModelLink<${idA}>\` in ${B} or add "${M}" to the ${nameA} store models.`
          });
        }
      } else if (options.staticOnly) {
        // R4 static mode (without stores)
        diagnostics.push({
          level: "WARN",
          code: "R4",
          sourceModel: idA,
          sourceAttribute: attr,
          targetModel: B,
          targetAttribute: K,
          message: `${idA}.${attr} expects ${B}.${K} to reference ${idA}, but it references ancestor ${M}. Override \`${K}: ModelLink<${idA}>\` in ${B} or ensure both models share a store.`
        });
      }
    }
  }

  return diagnostics;
}
