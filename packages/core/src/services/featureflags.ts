import { OperationContext } from "../contexts/operationcontext.js";
import { OperationDefinition } from "../core/icore.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { useContext } from "../contexts/execution.js";
import { useLog } from "@webda/workout";

/**
 * Whether an operation id matches a transport pattern
 * @param operationId - the operation identifier
 * @param pattern - `*`, a prefix such as `Service.*`, or an exact id
 * @returns true when it matches
 */
export function operationPatternMatches(operationId: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) {
    return operationId.startsWith(pattern.slice(0, -1));
  }
  return operationId === pattern;
}

/**
 * Evaluation context passed to providers (OpenFeature-compatible shape)
 */
export interface FeatureFlagContext {
  /** Stable targeting key: user id, else session id, else undefined */
  targetingKey?: string;
  /** Operation being evaluated, when evaluated for an operation */
  operationId?: string;
  /** The session (read-only) */
  session?: any;
  /** Extra attributes */
  [key: string]: unknown;
}

export interface FeatureFlagProvider {
  /**
   * @returns true when the flag is on, false when off, undefined when this provider does not know the flag
   */
  isEnabled(flag: string, context: FeatureFlagContext): Promise<boolean | undefined> | boolean | undefined;
}

export interface RegisteredFeatureFlagProvider {
  provider: FeatureFlagProvider;
  priority: number;
}

export interface RegisteredOperationFeatureFlag {
  pattern: string;
  flag: string;
}

/**
 * Return the list of registered feature flag providers from instance storage
 * @returns Array of registered feature flag providers
 */
function useProviders(): RegisteredFeatureFlagProvider[] {
  const storage = useInstanceStorage();
  storage.featureFlagProviders ??= [];
  return storage.featureFlagProviders;
}

/**
 * Return the list of registered operation-to-flag mappings from instance storage
 * @returns Array of registered operation feature flag mappings
 */
function useOperationFeatureFlags(): RegisteredOperationFeatureFlag[] {
  const storage = useInstanceStorage();
  storage.operationFeatureFlags ??= [];
  return storage.operationFeatureFlags;
}

/**
 * Register a feature flag provider
 * @param provider - provider implementing FeatureFlagProvider
 * @param priority - priority for evaluation order (descending, higher runs first). Default 0.
 */
export function registerFeatureFlagProvider(provider: FeatureFlagProvider, priority: number = 0): void {
  const providers = useProviders();
  const idx = providers.findIndex(p => p.provider === provider);
  if (idx !== -1) {
    providers.splice(idx, 1);
  }
  providers.push({ provider, priority });
  providers.sort((a, b) => b.priority - a.priority);
}

/**
 * Unregister a feature flag provider
 * @param provider - provider to unregister
 */
export function unregisterFeatureFlagProvider(provider: FeatureFlagProvider): void {
  const providers = useProviders();
  const idx = providers.findIndex(p => p.provider === provider);
  if (idx !== -1) {
    providers.splice(idx, 1);
  }
}

/**
 * Register a pattern -> flag mapping
 * @param pattern - operation pattern (e.g. "*", "Service.*", exact id)
 * @param flag - flag name
 */
export function registerOperationFeatureFlag(pattern: string, flag: string): void {
  const mappings = useOperationFeatureFlags();
  if (!mappings.some(m => m.pattern === pattern && m.flag === flag)) {
    mappings.push({ pattern, flag });
  }
}

/**
 * Unregister a pattern -> flag mapping
 * @param pattern - operation pattern
 * @param flag - flag name
 */
export function unregisterOperationFeatureFlag(pattern: string, flag: string): void {
  const mappings = useOperationFeatureFlags();
  const idx = mappings.findIndex(m => m.pattern === pattern && m.flag === flag);
  if (idx !== -1) {
    mappings.splice(idx, 1);
  }
}

/**
 * Resolve the flag(s) of an operation: definition.featureFlag + registered pattern mappings
 * @param operationId - the operation id
 * @param operation - optional operation definition
 * @returns array of flag names
 */
export function getOperationFeatureFlags(operationId: string, operation?: OperationDefinition): string[] {
  const flags = new Set<string>();
  let op = operation;
  if (!op) {
    try {
      op = useInstanceStorage().operations?.[operationId];
    } catch {
      // outside instance storage
    }
  }
  if (op?.featureFlag) {
    flags.add(op.featureFlag === true ? operationId : op.featureFlag);
  }
  try {
    const mappings = useOperationFeatureFlags();
    for (const mapping of mappings) {
      if (operationPatternMatches(operationId, mapping.pattern)) {
        flags.add(mapping.flag);
      }
    }
  } catch {
    // outside instance storage
  }
  return [...flags];
}

/**
 * Evaluate a flag with the current context (useContext()). Default when nobody knows the flag: `defaultValue` (false).
 * @param flag - flag name
 * @param options - evaluation options
 * @param options.context - operation context
 * @param options.defaultValue - default value when no provider handles the flag
 * @param options.operationId - operation ID being evaluated
 * @returns boolean indicating if the feature is enabled
 */
export async function isFeatureEnabled(
  flag: string,
  options?: { context?: OperationContext; defaultValue?: boolean; operationId?: string }
): Promise<boolean> {
  let context = options?.context;
  if (!context) {
    try {
      context = useContext<OperationContext>();
    } catch {
      // no ambient context
    }
  }
  let session: any;
  let targetingKey: string | undefined;
  if (context) {
    try {
      session = context.getSession?.();
    } catch {}
    try {
      targetingKey = context.getCurrentUserId?.();
    } catch {}
    if (!targetingKey) {
      try {
        targetingKey = session?.id ?? (context as any).getSessionId?.();
      } catch {}
    }
  }

  const ffContext: FeatureFlagContext = {
    targetingKey: targetingKey || undefined,
    operationId: options?.operationId,
    session
  };

  let providers: RegisteredFeatureFlagProvider[] = [];
  try {
    providers = useProviders();
  } catch {
    // outside instance storage
  }

  for (const { provider } of providers) {
    let result: boolean | undefined;
    try {
      result = await provider.isEnabled(flag, ffContext);
    } catch (err) {
      useLog("WARN", `Feature flag provider failed on flag "${flag}":`, err);
      return false; // A provider that throws counts as off (logged as WARN, not propagated)
    }
    if (result !== undefined) {
      return result;
    }
  }

  return options?.defaultValue ?? false;
}

/**
 * Check whether all feature flags for an operation are enabled for the given context
 * @param context - execution context
 * @param operationId - operation identifier
 * @param operation - optional operation definition
 * @returns true if the operation is enabled (or has no flags), false otherwise
 */
export async function isOperationEnabled(
  context: OperationContext,
  operationId: string,
  operation?: OperationDefinition
): Promise<boolean> {
  const flags = getOperationFeatureFlags(operationId, operation);
  if (flags.length === 0) {
    return true;
  }
  for (const flag of flags) {
    const enabled = await isFeatureEnabled(flag, { context, operationId });
    if (!enabled) {
      return false;
    }
  }
  return true;
}
