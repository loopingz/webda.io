/**
 * Self-contained stand-in for `@webda/core`: a `Service` base, `@Operation` and an operation context.
 */

/** Base class of services. */
export class Service {
  /**
   * Name of the service
   * @returns the name
   */
  getName(): string {
    return "";
  }
}

/** An operation context: never part of an operation input. */
export class OperationContext {
  /** The caller. */
  user?: string;
}

/**
 * Stand-in for `@Operation`
 * @param _args - ignored
 * @returns a no-op decorator
 */
export function Operation(..._args: any[]): any {
  return (value: any) => value;
}
