import type { CoreModelDefinition, ExposeParameters } from "./imodel";

/**
 * Expose the model through API or GraphQL if it exists
 * The model will be exposed using its class name + 's'
 * If you need to have a specific plural, use the annotation WebdaPlural
 *  to define the plural name
 *
 * @returns
 */
export function Expose(params: Partial<ExposeParameters> = {}) {
  return (target: CoreModelDefinition): void => {
    params.restrict ??= {};
    target.Expose = <ExposeParameters>params;
  };
}
