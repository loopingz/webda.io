import type { ModelDefinition, ExposeParameters } from "../internal/iapplication";

/**
 * Expose the model through API or GraphQL if it exists
 * The model will be exposed using its class name + 's'
 * If you need to have a specific plural, use the annotation WebdaPlural
 *  to define the plural name
 *
 * @returns
 */
export function Expose(...args: [Partial<ExposeParameters>?] | [any, string, PropertyDescriptor]): any {
  if (args.length === 3) {
    const [target, propertyKey, descriptor] = args;
    target.Expose = <ExposeParameters>{
      restrict: {}
    };
    return descriptor;
  }
  return (target: ModelDefinition): void => {
    const params = args[0] || {};
    params.restrict ??= {};
    target.Expose = <ExposeParameters>params;
  };
}
