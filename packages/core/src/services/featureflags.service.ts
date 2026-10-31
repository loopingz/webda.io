import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import {
  FeatureFlagProvider,
  FeatureFlagContext,
  registerFeatureFlagProvider,
  unregisterFeatureFlagProvider,
  registerOperationFeatureFlag,
  unregisterOperationFeatureFlag
} from "./featureflags.js";
import { QueryValidator } from "@webda/ql";
import { createHash } from "node:crypto";
import { useCoreEvents } from "../events/events.js";

/**
 * Detailed feature flag definition
 */
export type FeatureFlagRule = {
  /** Global switch, default true */
  enabled?: boolean;
  /** WebdaQL evaluated on the session, e.g. "roles CONTAINS 'beta'" */
  condition?: string;
  /** 0-100 stable rollout on targetingKey (hash(flag + targetingKey) % 100) */
  percentage?: number;
  /** Explicit allow-list of targeting keys */
  targets?: string[];
};

/**
 * Parameters for the FeatureFlagsService
 */
export class FeatureFlagsServiceParameters extends ServiceParameters {
  /**
   * Flags definitions
   * @default {}
   */
  flags: {
    [name: string]: boolean | FeatureFlagRule;
  };
  /**
   * Attach flags to operations by id or pattern (same syntax as transports `operations`: `*`, `Service.*`, exact id),
   * in addition to the ones declared in code. e.g. { "Posts.Delete": "safe-delete", "Admin.*": "admin-v2" }
   * @default {}
   */
  operations: { [pattern: string]: string };
  /**
   * Value of an unknown flag
   * @default false
   */
  defaultValue: boolean;

  /**
   * Load parameters
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    this.flags ??= {};
    this.operations ??= {};
    this.defaultValue ??= false;
    return this;
  }
}

/**
 * @WebdaModda Webda/FeatureFlags
 */
export class FeatureFlagsService extends Service<FeatureFlagsServiceParameters> implements FeatureFlagProvider {
  protected compiledConditions = new Map<string, QueryValidator>();
  protected registeredMappings: { pattern: string; flag: string }[] = [];
  protected offConfigApplied?: () => void;

  /**
   * Compile conditions and register operation pattern mappings from current parameters
   */
  recompile(): void {
    this.compiledConditions.clear();
    for (const [name, def] of Object.entries(this.parameters.flags || {})) {
      if (typeof def === "object" && def !== null && def.condition) {
        // Will throw if condition does not compile
        this.compiledConditions.set(name, new QueryValidator(def.condition));
      }
    }
    // Update operation pattern mappings
    for (const mapping of this.registeredMappings) {
      unregisterOperationFeatureFlag(mapping.pattern, mapping.flag);
    }
    this.registeredMappings = [];
    for (const [pattern, flag] of Object.entries(this.parameters.operations || {})) {
      registerOperationFeatureFlag(pattern, flag);
      this.registeredMappings.push({ pattern, flag });
    }
  }

  /**
   * Resolve service dependencies and register provider
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this.recompile();
    registerFeatureFlagProvider(this, 0);
    this.offConfigApplied = useCoreEvents("Webda.Configuration.Applied", () => {
      this.recompile();
    });
    return this;
  }

  /**
   * Stop service and clean up registrations
   * @returns promise that resolves when stopped
   */
  async stop(): Promise<void> {
    unregisterFeatureFlagProvider(this);
    for (const mapping of this.registeredMappings) {
      unregisterOperationFeatureFlag(mapping.pattern, mapping.flag);
    }
    this.registeredMappings = [];
    this.offConfigApplied?.();
    return super.stop();
  }

  /**
   * Evaluate whether a flag is enabled for the given context
   * @param flag - flag name
   * @param context - feature flag context
   * @returns boolean if known, undefined otherwise
   */
  isEnabled(flag: string, context: FeatureFlagContext): boolean | undefined {
    const def = this.parameters.flags?.[flag];
    if (def === undefined) {
      return this.parameters.defaultValue ?? false;
    }
    if (typeof def === "boolean") {
      return def;
    }
    if (def.enabled === false) {
      return false;
    }
    if (def.targets && def.targets.length > 0 && context.targetingKey && def.targets.includes(context.targetingKey)) {
      return true;
    }
    if (def.targets && def.targets.length > 0 && def.condition === undefined && def.percentage === undefined) {
      return false;
    }
    if (def.condition) {
      const validator = this.compiledConditions.get(flag);
      if (!validator || !validator.eval(context.session)) {
        return false;
      }
    }
    if (def.percentage !== undefined) {
      if (def.percentage <= 0) return false;
      if (def.percentage >= 100) return true;
      if (!context.targetingKey) return false;
      const hash = createHash("sha1").update(`${flag}:${context.targetingKey}`).digest();
      const bucket = hash.readUInt32BE(0) % 100;
      return bucket < def.percentage;
    }
    return true;
  }
}
