import { CloudEvent } from "cloudevents";
import { FilterImplementation } from "./abstract";
import type { AllFilter, AnyFilter, Filter } from "./types";
import { SqlFilterImplementation } from "./sql";
import { ExactFilterImplementation, PrefixFilterImplementation, SuffixFilterImplementation } from "./string";

interface FilterImplementationConstructor {
  new (definition: any): FilterImplementation<Filter>;
}

/**
 * Use of this MUST include a nested array of filter expressions, where all nested filter
 * expressions MUST evaluate to true in order for the all filter expression to be true.
 *
 * Note: there MUST be at least one filter expression in the array.
 */
export class AllFilterImplementation extends FilterImplementation<AllFilter> {
  filters: FilterImplementation<Filter>[];
  constructor(definition: AllFilter) {
    super(definition);
    this.filters = this.definition.all.map(f => FiltersHelper.get(f));
  }
  /**
   * @override
   */
  match(event: CloudEvent): boolean {
    for (const filter of this.filters) {
      if (!filter.match(event)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Use of this MUST include one nested array of filter expressions, where at least one nested
 * filter expressions MUST evaluate to true in order for the any filter expression to be true.
 *
 * Note: there MUST be at least one filter expression in the array.
 */
export class AnyFilterImplementation extends FilterImplementation<AnyFilter> {
  filters: FilterImplementation<Filter>[];
  constructor(definition: AnyFilter) {
    super(definition);
    this.filters = definition.any.map(f => FiltersHelper.get(f));
  }
  /**
   * @override
   */
  match(event: CloudEvent): boolean {
    for (const filter of this.filters) {
      if (filter.match(event)) {
        return true;
      }
    }
    return false;
  }
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
  static get<T extends Filter>(filter: T): FilterImplementation<Filter> {
    const type = Object.keys(filter).pop();
    if (type === undefined || !FilterImplementations[type]) {
      throw new Error(`Unsupported filter type '${type}'`);
    }
    return <FilterImplementation<T>>new FilterImplementations[type](filter).optimize();
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
