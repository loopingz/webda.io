import { CloudEvent } from "cloudevents";
import { Filter } from ".";

/**
 * Implementation of a defined filter
 */
export abstract class FilterImplementation<T extends Filter> {
  /**
   * Definition from the spec
   */
  definition: T;
  constructor(definition: T) {
    this.definition = definition;
  }

  /**
   * Return true if it match the filter, false otherwise
   *
   * @param event to filter
   */
  abstract match(event: CloudEvent<unknown>): boolean;

  /**
   * Option to return an optimized version of the filter
   *
   * For example a LEFT(type, 4) = "com." can be optimized to PREFIX(type, "com.")
   */
  optimize(): FilterImplementation<Filter> {
    return this;
  }
}
