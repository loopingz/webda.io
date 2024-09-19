//import RegexEscape from "regex-escape";
import { FilterImplementation } from "./abstract";
import { AllFilter, AllFilterImplementation, AnyFilter, AnyFilterImplementation, NotFilter } from "./logical";
import { SqlFilter, SqlFilterImplementation } from "./sql";
import {
  ExactFilter,
  ExactFilterImplementation,
  PrefixFilter,
  PrefixFilterImplementation,
  SuffixFilter,
  SuffixFilterImplementation
} from "./string";

export * from "./abstract";

interface FilterImplementationConstructor {
  new (definition: any): FilterImplementation<Filter>;
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

export type Filter = NotFilter | AllFilter | SqlFilter | ExactFilter | PrefixFilter | SuffixFilter | AnyFilter;

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
  static get<T extends Filter>(filter: T): FilterImplementation<Filter> {
    const type = Object.keys(filter).pop();
    if (type === undefined || !FilterImplementations[type]) {
      throw new Error(`Unsupported filter type '${type}'`);
    }
    return <FilterImplementation<T>>new FilterImplementations[type](filter).optimize();
  }
}
