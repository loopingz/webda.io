import { evaluate } from "./expression.js";
import type { Expr, FlowDefinition, FlowError, Journal, Stmt, TaskOptions } from "./graph.js";

/**
 * Maximum number of iterations of a `while`
 */
export const MAX_LOOP_ITERATIONS = 10000;

/**
 * A task the engine has to run: the next missing outcome of the journal
 */
export interface ScheduledTask {
  /**
   * Task key: `<statement id>@<iteration path>`
   */
  key: string;
  operation: string;
  input: any;
  /**
   * Flow defaults merged with the task options
   */
  options: TaskOptions;
}

/**
 * Result of a replay
 */
export type RunResult =
  | { status: "done"; output: any }
  | { status: "error"; error: FlowError }
  | { status: "pending"; schedule: ScheduledTask[] };

/**
 * An error thrown inside the flow, catchable by a `try`
 */
class FlowThrow {
  /**
   * @param error - the flow error
   */
  constructor(public error: FlowError) {}
}

/**
 * How a block ended
 */
type Completion = { type: "normal" } | { type: "return"; value: any } | { type: "pending"; schedule: ScheduledTask[] };

const NORMAL: Completion = { type: "normal" };

/**
 * Task key of a statement at an iteration path
 * @param id - the statement id
 * @param path - indexes of the enclosing loops and branches
 * @returns the key
 */
export function taskKey(id: string, path: number[]): string {
  return `${id}@${path.join(".")}`;
}

/**
 * Statement id of a task key
 * @param key - the task key
 * @returns the statement id
 */
export function statementIdOf(key: string): string {
  return key.substring(0, key.lastIndexOf("@"));
}

/**
 * Replay of one flow against its journal
 */
class Replay {
  /**
   * @param def - the flow
   * @param journal - finished task outcomes
   */
  constructor(
    protected def: FlowDefinition,
    protected journal: Journal
  ) {}

  /**
   * Throw a flow error
   * @param code - error code
   * @param message - error message
   * @returns never
   */
  fail(code: string, message: string): never {
    throw new FlowThrow({ code, message, operation: this.def.id });
  }

  /**
   * Evaluate an expression, an invalid one throws in the flow
   * @param expr - the expression
   * @param scope - the variables
   * @returns the value
   */
  value(expr: Expr, scope: Record<string, any>): any {
    try {
      return evaluate(expr, scope);
    } catch (err) {
      return this.fail("ExpressionError", (err as Error).message);
    }
  }

  /**
   * Run a block of statements in order, stopping at the first one that does not complete normally
   * @param stmts - the statements
   * @param scope - the variables
   * @param path - the iteration path
   * @returns the completion
   */
  block(stmts: Stmt[] | undefined, scope: Record<string, any>, path: number[]): Completion {
    for (const stmt of stmts ?? []) {
      const res = this.stmt(stmt, scope, path);
      if (res.type !== "normal") {
        return res;
      }
    }
    return NORMAL;
  }

  /**
   * Run one statement
   * @param stmt - the statement
   * @param scope - the variables
   * @param path - the iteration path
   * @returns the completion
   */
  stmt(stmt: Stmt, scope: Record<string, any>, path: number[]): Completion {
    switch (stmt.kind) {
      case "task":
        return this.task(stmt, scope, path);
      case "assign":
        scope[stmt.name] = this.value(stmt.value, scope);
        return NORMAL;
      case "if":
        return this.block(this.value(stmt.cond, scope) ? stmt.then : stmt.else, scope, path);
      case "forOf": {
        const items = this.value(stmt.items, scope);
        if (!Array.isArray(items)) {
          this.fail("TypeError", `${stmt.id}: items is not an array`);
        }
        for (let i = 0; i < items.length; i++) {
          scope[stmt.item] = items[i];
          const res = this.block(stmt.body, scope, [...path, i]);
          if (res.type !== "normal") {
            return res;
          }
        }
        return NORMAL;
      }
      case "while":
        for (let i = 0; this.value(stmt.cond, scope); i++) {
          if (i >= MAX_LOOP_ITERATIONS) {
            this.fail("LoopLimit", `${stmt.id}: more than ${MAX_LOOP_ITERATIONS} iterations`);
          }
          const res = this.block(stmt.body, scope, [...path, i]);
          if (res.type !== "normal") {
            return res;
          }
        }
        return NORMAL;
      case "try":
        return this.try(stmt, scope, path);
      case "parallel":
        return this.concurrent(
          stmt.branches.map((branch, i) => ({ body: branch, scope: structuredClone(scope), path: [...path, i] })),
          Infinity,
          scope,
          stmt.assign
        );
      case "map": {
        const items = this.value(stmt.items, scope);
        if (!Array.isArray(items)) {
          this.fail("TypeError", `${stmt.id}: items is not an array`);
        }
        return this.concurrent(
          items.map((item, i) => ({
            body: stmt.body,
            scope: { ...structuredClone(scope), [stmt.item]: structuredClone(item) },
            path: [...path, i]
          })),
          stmt.concurrency && stmt.concurrency > 0 ? stmt.concurrency : Infinity,
          scope,
          stmt.assign
        );
      }
      case "return":
        return { type: "return", value: stmt.value === undefined ? undefined : this.value(stmt.value, scope) };
      case "throw": {
        const value = this.value(stmt.value, scope);
        if (value && typeof value.code === "string" && typeof value.message === "string") {
          // A caught FlowError rethrown
          throw new FlowThrow({ code: value.code, message: value.message, operation: String(value.operation ?? "") });
        }
        return this.fail("FlowError", typeof value === "string" ? value : JSON.stringify(value));
      }
    }
    return this.fail("InvalidStatement", `Unknown statement kind ${(stmt as any)?.kind}`);
  }

  /**
   * A task: its outcome from the journal, or schedule it
   * @param stmt - the task statement
   * @param scope - the variables
   * @param path - the iteration path
   * @returns the completion
   */
  task(stmt: Extract<Stmt, { kind: "task" }>, scope: Record<string, any>, path: number[]): Completion {
    const key = taskKey(stmt.id, path);
    const outcome = this.journal[key];
    if (outcome === undefined) {
      return {
        type: "pending",
        schedule: [
          {
            key,
            operation: stmt.operation,
            input: this.value(stmt.input, scope),
            options: { ...this.def.options, ...stmt.options }
          }
        ]
      };
    }
    if ("error" in outcome) {
      throw new FlowThrow(outcome.error);
    }
    if (stmt.assign) {
      scope[stmt.assign] = structuredClone(outcome.result);
    }
    return NORMAL;
  }

  /**
   * try/catch/finally: finally runs after the body or the catch, then their completion goes on
   * @param stmt - the try statement
   * @param scope - the variables
   * @param path - the iteration path
   * @returns the completion
   */
  try(stmt: Extract<Stmt, { kind: "try" }>, scope: Record<string, any>, path: number[]): Completion {
    let res: Completion = NORMAL;
    let thrown: FlowThrow | undefined;
    try {
      res = this.block(stmt.body, scope, path);
    } catch (err) {
      if (!(err instanceof FlowThrow)) throw err;
      if (stmt.catch) {
        if (stmt.catchVar) {
          scope[stmt.catchVar] = structuredClone(err.error);
        }
        try {
          res = this.block(stmt.catch, scope, path);
        } catch (err2) {
          if (!(err2 instanceof FlowThrow)) throw err2;
          thrown = err2;
        }
      } else {
        thrown = err;
      }
    }
    if (res?.type === "pending") {
      return res;
    }
    const fin = this.block(stmt.finally, scope, path);
    if (fin.type !== "normal") {
      return fin;
    }
    if (thrown) {
      throw thrown;
    }
    return res;
  }

  /**
   * Run branches concurrently: each one on its own copy of the variables, at most `concurrency` unfinished
   * @param branches - the bodies with their scope and path
   * @param concurrency - maximum number of unfinished branches
   * @param scope - the parent variables
   * @param assign - variable receiving the return values
   * @returns the completion
   */
  concurrent(
    branches: { body: Stmt[]; scope: Record<string, any>; path: number[] }[],
    concurrency: number,
    scope: Record<string, any>,
    assign?: string
  ): Completion {
    const values: any[] = [];
    const schedule: ScheduledTask[] = [];
    let running = 0;
    let error: FlowThrow | undefined;
    for (const branch of branches) {
      if (running >= concurrency) {
        // A later branch cannot start before one of the running ones finishes
        break;
      }
      try {
        const res = this.block(branch.body, branch.scope, branch.path);
        if (res.type === "pending") {
          running++;
          schedule.push(...res.schedule);
        } else {
          values.push(res.type === "return" ? res.value : undefined);
        }
      } catch (err) {
        if (!(err instanceof FlowThrow)) throw err;
        // The first branch to fail (in order) fails the whole statement
        error ??= err;
      }
    }
    if (error) {
      throw error;
    }
    if (schedule.length) {
      return { type: "pending", schedule };
    }
    if (assign) {
      scope[assign] = values;
    }
    return NORMAL;
  }
}

/**
 * Replay a flow against its journal
 *
 * Pure: no I/O, the same arguments always give the same result.
 * @param def - the flow definition
 * @param input - the flow input, by parameter name
 * @param journal - outcomes of the finished tasks
 * @returns done with the output, error with the uncaught error, or pending with the tasks to run
 */
export function run(def: FlowDefinition, input: Record<string, any>, journal: Journal): RunResult {
  const replay = new Replay(def, journal);
  try {
    const res = replay.block(def.body, structuredClone(input ?? {}), []);
    if (res.type === "pending") {
      return { status: "pending", schedule: res.schedule };
    }
    return { status: "done", output: res.type === "return" ? res.value : undefined };
  } catch (err) {
    if (err instanceof FlowThrow) {
      return { status: "error", error: err.error };
    }
    throw err;
  }
}
