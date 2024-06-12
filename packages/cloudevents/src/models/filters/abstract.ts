import { CloudEvent } from "cloudevents";

/**
 * Representation of subscription filtering
 */
export interface Filter {}

/**
 * Implementation of a defined filter
 */
export abstract class FilterImplementation<T extends Filter = Filter> {
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
  optimize(): FilterImplementation {
    return this;
  }
}
