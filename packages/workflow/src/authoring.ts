/**
 * The authoring API of `.flow.ts` files
 *
 * A flow is an `async` method of a class extending {@link Workflow}, in a file ending with `.flow.ts`. Its body is
 * never executed: the build compiles it into a workflow graph that {@link WorkflowService} runs. Everything here is
 * a typed stub that throws if it is ever called.
 *
 * Operations are called as `<ServiceClass>.<Method>(input, options?)` and other flows as
 * `<FlowClass>.<Method>(input, options?)`: `@webda/content-mapper` declares those calls in each `.flow.ts` file.
 */
import type { TaskOptions } from "./graph.js";

export type { TaskOptions };

/** Message of every stub. */
const NOT_EXECUTABLE = "Flows run through WorkflowService";

/**
 * Throw: a flow body is compiled, never executed
 * @returns never
 */
function notExecutable(): never {
  throw new Error(NOT_EXECUTABLE);
}

declare global {
  interface DateConstructor {
    /**
     * Current time in milliseconds, recorded by the flow: a retry or a resume reads the recorded value
     *
     * Only available in a `.flow.ts` flow.
     */
    Now(): Promise<number>;
  }
}

/**
 * Base class of the flow classes of a `.flow.ts` file: each `async` method is a flow `<Class>.<Method>`
 */
export abstract class Workflow {
  /**
   * Flow classes are never instantiated
   */
  constructor() {
    notExecutable();
  }

  /**
   * Run a body for each item concurrently (a `map` statement)
   * @param _items - the items
   * @param _fn - a single call, or an async block, run for each item
   * @param _options - options
   * @param _options.concurrency - maximum number of items running at once
   * @returns the value of each item, in order
   */
  static Parallel<T, R>(_items: T[], _fn: (item: T) => Promise<R>, _options?: { concurrency?: number }): Promise<R[]> {
    return notExecutable();
  }

  /**
   * Start a child flow without waiting for it
   * @param _flow - the child flow, as `OtherFlows.Method`
   * @param _input - its input
   * @returns the uuid of the child instance
   */
  static Start<I>(_flow: (input: I, options?: TaskOptions) => Promise<any>, _input: I): Promise<{ uuid: string }> {
    return notExecutable();
  }

  /**
   * Call any operation by id, untyped: model operations (`Order.Query`) or operations of other packages
   * @param _operationId - the operation id, a string literal
   * @param _input - its input
   * @param _options - task options
   * @returns the operation result
   */
  static Call<R = any>(_operationId: string, _input?: Record<string, any>, _options?: TaskOptions): Promise<R> {
    return notExecutable();
  }
}

/**
 * Wait for a duration (`"1h"`) or until a time (`{ until: timestamp }`)
 * @param _duration - the duration, or the end time
 * @returns when the timer fires
 */
export function Sleep(_duration: string | { until: number }): Promise<void> {
  return notExecutable();
}

/**
 * Signals
 */
export const Wait = {
  /**
   * Wait for the signal `name` sent with `key` (`Workflow.Signal`): its payload is the result
   * @param _name - the event name
   * @param _options - options
   * @param _options.key - key to match
   * @param _options.timeout - Duration after which the wait throws
   * @param _options.allow - user ids that may send it besides the launcher
   * @returns the signal payload
   */
  ForEvent<T = any>(_name: string, _options: { key: string; timeout?: string; allow?: string[] }): Promise<T> {
    return notExecutable();
  }
};

/**
 * Random values, recorded by the flow
 */
export const Random = {
  /**
   * A number in [0, 1)
   * @returns the number
   */
  Number(): Promise<number> {
    return notExecutable();
  },
  /**
   * A UUID
   * @returns the uuid
   */
  Uuid(): Promise<string> {
    return notExecutable();
  }
};

/**
 * Launch a flow on a schedule, read by the build: every argument must be a literal
 *
 * Several are allowed. The launch runs as the system.
 * @param _cron - cron expression
 * @param _description - description
 * @param _input - the flow input
 * @returns a decorator that changes nothing
 */
export function Cron(_cron: string, _description?: string, _input?: Record<string, any>) {
  return <T>(value: T, _context: ClassMethodDecoratorContext<Workflow>): T => value;
}
