import { deepmergeCustom } from "deepmerge-ts";
import { useApplication } from "./hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { Parameters } from "./parameters.js";
import { validateSchemaDefinition } from "../schemas/hooks.js";
import type { ModelConfiguration } from "./iconfiguration.js";
import type { JSONSchema7 } from "json-schema";
import * as WebdaError from "../errors/errors.js";

const merge = deepmergeCustom({ mergeArrays: false });

/** A class declaring typed runtime parameters. */
export interface Configurable<T extends Parameters = Parameters> {
  readonly prototype: unknown;
  Parameters?: new () => T;
}

/**
 * Resolve model overrides along the inheritance chain; arrays replace previous values.
 * @param model - model class
 * @returns inherited model configuration
 */
export function useModelConfiguration(model: any): ModelConfiguration {
  const configuration = useCore().applicationConfiguration.models ?? {};
  const layers: ModelConfiguration[] = [];
  for (let current = model; current && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
    if (Object.hasOwn(current, "Metadata")) {
      const id = useModelMetadata(current).Identifier;
      layers.unshift(
        merge(
          { behaviors: Object.hasOwn(current, "BehaviorParameters") ? current.BehaviorParameters : {} },
          configuration[id] ?? {}
        )
      );
    }
  }
  return merge({}, ...layers);
}

/**
 * Construct and validate a parameter object without attaching it to a persisted model.
 * @param type - class declaring its Parameters constructor
 * @param input - resolved overrides
 * @param schema - optional generated parameter schema
 * @returns typed configuration
 */
function resolveParameters<T extends Parameters>(type: Configurable<T>, input: any, schema?: JSONSchema7): T {
  const Constructor = type.Parameters ?? Parameters;
  const result = new Constructor().load(input);
  if (schema) validateSchemaDefinition(schema, JSON.parse(JSON.stringify(result)));
  return result as T;
}

/**
 * Read the parameters of a model class.
 * @param model - model class with an optional static Parameters declaration
 * @returns validated model parameters
 */
export function useModelParameters<T extends Parameters>(model: Configurable<T>): T {
  return resolveParameters(model, useModelConfiguration(model).parameters ?? {}, useModelMetadata(model as any).Schema);
}

/**
 * Read the policy of a particular behavior attribute on a model.
 * @param model - owning model class
 * @param attribute - owning attribute name
 * @param behavior - behavior class declaring Parameters
 * @returns validated behavior parameters
 */
export function useBehaviorParameters<T extends Parameters>(
  model: any,
  attribute: string,
  behavior: Configurable<T>
): T {
  const relation = useModelMetadata(model).Relations?.behaviors?.find(entry => entry.attribute === attribute);
  if (!relation) {
    throw new WebdaError.CodeError(
      "BEHAVIOR_NOT_FOUND",
      `Unknown behavior ${attribute} on ${useModelMetadata(model).Identifier}`
    );
  }
  const schema = useApplication().getBehaviorMetadata(relation.behavior)?.Schema;
  return resolveParameters(behavior, useModelConfiguration(model).behaviors?.[attribute] ?? {}, schema);
}
