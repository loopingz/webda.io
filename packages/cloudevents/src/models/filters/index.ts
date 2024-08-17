//import RegexEscape from "regex-escape";
import { Filter, FilterImplementation } from "./abstract";
import { AllFilterImplementation, AnyFilterImplementation } from "./logical";
import { SqlFilterImplementation } from "./sql";
import { ExactFilterImplementation, PrefixFilterImplementation, SuffixFilterImplementation } from "./string";

export * from "./abstract";

interface FilterImplementationConstructor {
  new (definition: any): FilterImplementation;
}

/**
 * Filter Implementation registry
 */
const FilterImplementations: { [key: string]: FilterImplementationConstructor } = {
  exact: ExactFilterImplementation,
  prefix: PrefixFilterImplementation,
  suffix: SuffixFilterImplementation,
  all: AllFilterImplementation,
  any: AnyFilterImplementation,
  sql: SqlFilterImplementation
};

/**
 * Retrieve an FilterImplementation object based on the
 * definition
 */
export class FiltersHelper {
  /**
   * Get the filter implementation
   * @param filter
   * @returns
   */
  static get(filter: Filter): FilterImplementation {
    let type = Object.keys(filter).pop();
    if (type === undefined || !FilterImplementations[type]) {
      throw new Error(`Unsupported filter type '${type}'`);
    }
    return new FilterImplementations[type](filter).optimize();
  }

  /**
   * Register a custom filter implementation
   * @param name
   * @param clazz
   */
  register(name: string, clazz: FilterImplementationConstructor) {
    FilterImplementations[name] = clazz;
  }
}
