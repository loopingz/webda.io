import { AsyncLocalStorage } from "node:async_hooks";
import { useLog } from "@webda/workout";
import type { Context } from "../contexts/icontext.js";
import { useContext } from "../contexts/execution.js";
import type { OperationDefinition } from "./icore.js";
import { useInstanceStorage } from "./instancestorage.js";

/**
 * A resource taking part in the transaction of an operation (a database connection, a session...)
 *
 * `callOperation` drives the lifecycle of the outermost operation: {@link begin} after the input and permission
 * checks and before `Webda.BeforeOperation`, {@link commit} once the method resolved (a streamed result fully
 * written) and before `Webda.OperationSuccess`, {@link rollback} on any failure, before `Webda.OperationFailure`.
 * Nested operations join the outer transaction: they never begin nor finish it.
 *
 * Participants keep their per-transaction state in the {@link OperationTransaction} slots
 * (`useOperationTransaction().set(key, state)`), and must be idempotent: `commit` or `rollback` may be called on a
 * participant that never opened anything, and `rollback` is called on a participant whose `commit` failed.
 */
export interface OperationTransactionParticipant {
  /**
   * Name, used in logs
   */
  readonly name: string;
  /**
   * Start the participation: open lazily when possible (an operation that never uses the resource should cost
   * nothing)
   * @param context - the execution context
   * @param operation - the operation definition, undefined outside an operation (`runWithTransaction`);
   *   `operation.transaction === false` asks the participant to stay out
   */
  begin(context: Context, operation?: OperationDefinition): Promise<void>;
  /**
   * Commit the work, then release the resources whatever the outcome
   * @param context - the execution context
   */
  commit(context: Context): Promise<void>;
  /**
   * Roll back the work, then release the resources whatever the outcome
   * @param context - the execution context
   * @param error - the error failing the operation
   */
  rollback(context: Context, error: unknown): Promise<void>;
}

// Test are transpiling and creating several instances of this module: share the storage through the process
process["webdaOperationTransactions"] ??= new AsyncLocalStorage<OperationTransaction>();
const storage: AsyncLocalStorage<OperationTransaction> = process["webdaOperationTransactions"];

/**
 * The transaction of an operation (or of `runWithTransaction`): the participants enlisted in it and their state
 *
 * It follows the async call chain of the operation, independently of the execution context: code switching to
 * another context inside the operation (`runAsSystem`, a nested `callOperation`) stays in the transaction.
 */
export class OperationTransaction {
  /**
   * Participants enlisted, in order
   */
  protected readonly participants: OperationTransactionParticipant[] = [];
  /**
   * Participants committed or rolled back
   */
  protected readonly finished = new Set<OperationTransactionParticipant>();
  /**
   * Per-participant state
   */
  protected readonly slots = new Map<string, any>();
  /**
   * True once committed or rolled back
   */
  protected ended = false;

  /**
   * @param context - the execution context
   * @param operation - the operation, undefined outside an operation
   */
  constructor(
    readonly context: Context,
    public operation?: OperationDefinition
  ) {}

  /**
   * @returns true until the transaction is committed or rolled back
   */
  isActive(): boolean {
    return !this.ended;
  }

  /**
   * @param key - the slot key
   * @returns the state stored by a participant
   */
  get<T = any>(key: string): T | undefined {
    return this.slots.get(key);
  }

  /**
   * Store a participant state
   * @param key - the slot key, e.g. `sql.tx.<store name>`
   * @param value - the state
   * @returns this
   */
  set(key: string, value: any): this {
    this.slots.set(key, value);
    return this;
  }

  /**
   * @param participant - the participant
   * @returns true when the participant is enlisted
   */
  has(participant: OperationTransactionParticipant): boolean {
    return this.participants.includes(participant);
  }

  /**
   * Enlist a participant and begin it; a participant already enlisted is left as is
   *
   * The participant is enlisted before `begin` so a failing `begin` still gets a `rollback` to clean up.
   * @param participant - the participant
   */
  async enlist(participant: OperationTransactionParticipant): Promise<void> {
    if (this.has(participant)) {
      return;
    }
    this.participants.push(participant);
    await participant.begin(this.context, this.operation);
  }

  /**
   * Commit every participant in enlistment order
   *
   * When a commit fails, the participants not committed yet (the failing one included) are rolled back and the
   * commit error is thrown. The ones already committed stay committed: there is no two-phase commit.
   */
  async commit(): Promise<void> {
    for (const participant of this.participants) {
      if (this.finished.has(participant)) {
        continue;
      }
      try {
        await participant.commit(this.context);
      } catch (err) {
        useLog("ERROR", `Transaction participant ${participant.name} failed to commit`, err);
        await this.rollback(err);
        throw err;
      }
      this.finished.add(participant);
    }
    this.ended = true;
  }

  /**
   * Roll back every participant not committed yet; their errors are logged, never thrown
   * @param error - the error failing the transaction
   */
  async rollback(error: unknown): Promise<void> {
    for (const participant of this.participants) {
      if (this.finished.has(participant)) {
        continue;
      }
      this.finished.add(participant);
      try {
        await participant.rollback(this.context, error);
      } catch (err) {
        useLog("ERROR", `Transaction participant ${participant.name} failed to roll back`, err);
      }
    }
    // Ended once every participant is finished: they can still read their state while rolling back
    this.ended = true;
  }

  /**
   * Run a function inside this transaction: `useOperationTransaction()` returns it in the whole async chain
   * @param fn - the function
   * @returns the function result
   */
  run<T>(fn: () => T): T {
    return storage.run(this, fn);
  }
}

/**
 * @returns the participants of the current instance
 */
function useParticipants(): Set<OperationTransactionParticipant> {
  const instance = useInstanceStorage();
  instance.operationTransactionParticipants ??= new Set();
  return instance.operationTransactionParticipants as Set<OperationTransactionParticipant>;
}

/**
 * Register a participant in the transaction of every operation; participants commit in registration order
 * @param participant - the participant
 */
export function registerOperationTransactionParticipant(participant: OperationTransactionParticipant): void {
  useParticipants().add(participant);
}

/**
 * Unregister a transaction participant
 * @param participant - the participant
 */
export function unregisterOperationTransactionParticipant(participant: OperationTransactionParticipant): void {
  useParticipants().delete(participant);
}

/**
 * @returns the registered transaction participants, in registration order
 */
export function listOperationTransactionParticipants(): OperationTransactionParticipant[] {
  return [...useParticipants()];
}

/**
 * @returns the transaction of the current async call chain, undefined outside one or once it ended
 */
export function useOperationTransaction(): OperationTransaction | undefined {
  const transaction = storage.getStore();
  return transaction?.isActive() ? transaction : undefined;
}

/**
 * Run a function in a transaction, for code outside operations (CLI, queue workers, tests)
 *
 * Inside an active transaction, the participants are enlisted in it and the function joins it: the work is
 * committed with the outer transaction. Otherwise a transaction is begun, committed when the function resolves and
 * rolled back when it throws.
 * @param fn - the function
 * @param participants - the participants, every registered one by default
 * @param context - the execution context handed to the participants
 * @returns the function result
 */
export async function runWithTransaction<T>(
  fn: () => Promise<T>,
  participants: OperationTransactionParticipant[] = listOperationTransactionParticipants(),
  context: Context = useContext()
): Promise<T> {
  const current = useOperationTransaction();
  if (current) {
    for (const participant of participants) {
      await current.enlist(participant);
    }
    return fn();
  }
  const transaction = new OperationTransaction(context);
  return transaction.run(async () => {
    try {
      for (const participant of participants) {
        await transaction.enlist(participant);
      }
      const result = await fn();
      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback(err);
      throw err;
    }
  });
}
