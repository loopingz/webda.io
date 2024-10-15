import type { ModelDefinition, ExposeParameters } from "../internal/iapplication";

/**
 * Expose the model through API or GraphQL if it exists
 * The model will be exposed using its class name + 's'
 * If you need to have a specific plural, use the annotation WebdaPlural
 *  to define the plural name
 *
 * @returns
 */
export function Expose(params: Partial<ExposeParameters>) {
  return (target: ModelDefinition): void => {
    params.restrict ??= {};
    target.Expose = <ExposeParameters>params;
  };
}
