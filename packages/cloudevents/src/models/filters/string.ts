import { CloudEvent } from "cloudevents";
import { Filter, FilterImplementation } from "./abstract";

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the
 * CloudEvents attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST exactly match the value
 * String specified (case sensitive).
 *
 * The attribute name and value specified in the filter express MUST NOT be empty strings.
 */
export interface ExactFilter {
  exact: {
    [key: string]: string;
  };
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the CloudEvents
 * attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST start with the value
 * String specified (case sensitive).
 *
 * The attribute name and value specified in the filter express MUST NOT be empty strings.
 */
export interface PrefixFilter {
  prefix: {
    [key: string]: string;
  };
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the CloudEvents
 * attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST end with the value
 * String specified (case sensitive).
 *
 * The attribute name and value specified in the filter express MUST NOT be empty strings.
 *
 */ export interface SuffixFilter {
  suffix: {
    [key: string]: string;
  };
}

/**
 * Abstract class to read CloudEvent specified property
 */
export abstract class StringPropertyFilterImplementation<T extends Filter> extends FilterImplementation<T> {
  /**
   * Property to read event from
   */
  property: string;
  /**
   * Filter property to read from
   */
  filterProperty: string;
  constructor(definition: T, filterProperty: string) {
    super(definition);
    this.filterProperty = filterProperty;
    // @ts-ignore
    if (Object.keys(definition[filterProperty]).length !== 1) {
      throw new Error("Filter only accept one property filtering");
    }
    // @ts-ignore
    this.property = Object.keys(definition[filterProperty]).pop();
  }

  /**
   * @override
   */
  match(event: CloudEvent): boolean {
    let value: string = <string>event[this.property];
    if (!event[this.property] || typeof value !== "string") {
      return false;
    }
    // @ts-ignore
    return this.matchString(value, this.definition[this.filterProperty][this.property]);
  }

  /**
   * Verify if value match the condition
   *
   * @param value from the CloudEvent
   * @param condition from the filter definition
   */
  abstract matchString(value: string, condition: string): boolean;
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the
 * CloudEvents attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST start with the value
 * String specified (case sensitive).
 */
export class PrefixFilterImplementation extends StringPropertyFilterImplementation<PrefixFilter> {
  constructor(definition: PrefixFilter) {
    super(definition, "prefix");
  }

  /**
   * @override
   */
  matchString(value: string, condition: string) {
    return value.startsWith(condition);
  }
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the
 * CloudEvents attribute to be matched, and its value is the String value to use in the comparison.
 * To evaluate to true the value of the matching CloudEvents attribute MUST end with the value
 * String specified (case sensitive).
 */
export class SuffixFilterImplementation extends StringPropertyFilterImplementation<SuffixFilter> {
  constructor(definition: SuffixFilter) {
    super(definition, "suffix");
  }

  /**
   * @override
   */
  matchString(value: string, condition: string) {
    return value.endsWith(condition);
  }
}

/**
 * Use of this MUST include exactly one nested property, where the key is the name of the CloudEvents
 * attribute to be matched, and its value is the String value to use in the comparison. To evaluate
 * to true the value of the matching CloudEvents attribute MUST exactly match the value String
 * specified (case sensitive).
 */
export class ExactFilterImplementation extends StringPropertyFilterImplementation<ExactFilter> {
  constructor(definition: ExactFilter) {
    super(definition, "exact");
  }

  /**
   * @override
   */
  matchString(value: string, condition: string) {
    return value === condition;
  }
}
