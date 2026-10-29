/**
 * Self-contained stand-in for the `@webda/workflow` authoring API (`authoring.ts`), with the same signatures.
 */

/** Options of a task. */
export interface TaskOptions {
  retries?: number;
  backoff?: "fixed" | "exponential";
  delay?: string;
  timeout?: string;
  useSystem?: boolean;
}

declare global {
  interface DateConstructor {
    /** Current time, recorded by the flow. */
    Now(): Promise<number>;
  }
}

/** Base class of flows. */
export abstract class Workflow {
  constructor() {
    throw new Error("Flows run through WorkflowService");
  }

  /**
   * Run a body for each item concurrently
   * @param _items - the items
   * @param _fn - the body
   * @param _options - concurrency
   * @returns the item results
   */
  static Parallel<T, R>(_items: T[], _fn: (item: T) => Promise<R>, _options?: { concurrency?: number }): Promise<R[]> {
    throw new Error("Flows run through WorkflowService");
  }

  /**
   * Start a child flow without waiting for it
   * @param _flow - the child flow
   * @param _input - its input
   * @returns the child instance uuid
   */
  static Start<I>(_flow: (input: I, options?: TaskOptions) => Promise<any>, _input: I): Promise<{ uuid: string }> {
    throw new Error("Flows run through WorkflowService");
  }

  /**
   * Call any operation by id
   * @param _operationId - the operation id
   * @param _input - its input
   * @param _options - task options
   * @returns the operation result
   */
  static Call<R = any>(_operationId: string, _input?: Record<string, any>, _options?: TaskOptions): Promise<R> {
    throw new Error("Flows run through WorkflowService");
  }
}

/**
 * Wait for a duration or until a time
 * @param _duration - duration, or `{ until }`
 */
export function Sleep(_duration: string | { until: number }): Promise<void> {
  throw new Error("Flows run through WorkflowService");
}

/** Wait for a signal. */
export const Wait: {
  ForEvent<T = any>(name: string, options: { key: string; timeout?: string; allow?: string[] }): Promise<T>;
} = undefined as any;

/** Recorded random values. */
export const Random: { Number(): Promise<number>; Uuid(): Promise<string> } = undefined as any;

/**
 * Launch a flow on a schedule
 * @param _cron - cron expression
 * @param _description - description
 * @param _input - flow input
 * @returns a no-op decorator
 */
export function Cron(_cron: string, _description?: string, _input?: Record<string, any>): any {
  return (value: any) => value;
}
