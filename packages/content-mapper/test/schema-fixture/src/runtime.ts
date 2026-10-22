/**
 * Minimal stand-in for `@webda/core`'s service base classes.
 *
 * Deliberately separate from `test/fixture`: the schema tests need services
 * with exotic parameter types, and adding those to the shared fixture would
 * change the edit counts the two-pass tests assert on.
 */

/** Base class for service parameters. */
export class ServiceParameters {
  /** Type of the service. */
  type: string;

  /**
   * Load raw configuration into this instance.
   * @param data - raw configuration
   * @returns this
   */
  load(data: unknown): this {
    Object.assign(this, data);
    return this;
  }
}

/**
 * Base class for services, parameterised by its configuration.
 * @typeParam T - the parameters type
 */
export class Service<T extends ServiceParameters = ServiceParameters> {
  parameters!: T;
}

/** Stand-in for `@webda/core`'s abstract operation context. */
export abstract class IOperationContext {}

/** Stand-in for `@webda/core`'s operation context, given to actions instead of an input. */
export class OperationContext extends IOperationContext {
  /**
   * Write to the output.
   * @param _value - the value
   */
  write(_value: unknown): void {}
}
