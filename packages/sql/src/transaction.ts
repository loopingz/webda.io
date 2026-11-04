import { WebdaError } from "@webda/core";
import type { SQLClient } from "./dialect.js";

/**
 * Transaction mode of a SQL store
 *
 * - "none": autocommit per statement
 * - "operation": every statement of an operation runs in one transaction, committed when the operation succeeds and
 *   rolled back when it fails
 */
export type SQLTransactionMode = "none" | "operation";

/**
 * A connection holding an open transaction (BEGIN already run), handed out by `SQLStore.openTransaction`
 */
export interface SQLTransactionConnection {
  /**
   * The client the statements of the transaction run on
   */
  client: SQLClient;
  /**
   * Run COMMIT
   */
  commit(): Promise<void>;
  /**
   * Run ROLLBACK
   */
  rollback(): Promise<void>;
  /**
   * Give the connection back, called once after the commit or the rollback
   * @param error - set when the connection may be broken: it should be destroyed rather than reused
   */
  release(error?: unknown): void | Promise<void>;
}

/**
 * Thrown when a transaction cannot commit because one of its statements failed (or its connection could not open):
 * the work is rolled back
 */
export class SQLTransactionAbortedError extends WebdaError.CodeError {
  /**
   * @param cause - the error that aborted the transaction
   */
  constructor(readonly cause: unknown) {
    super(
      "SQL_TRANSACTION_ABORTED",
      `The transaction was rolled back: a statement failed (${(cause as Error)?.message ?? cause})`
    );
  }
}

/**
 * The transaction of a SQL store inside an operation: opened lazily by the first statement, then committed or
 * rolled back once
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> Idle: begin (no connection)
 *   Idle --> Open: first statement, connect + BEGIN
 *   Idle --> [*]: commit / rollback (nothing to do)
 *   Open --> Failed: statement error
 *   Open --> Committed: commit
 *   Open --> RolledBack: rollback
 *   Failed --> RolledBack: commit (throws SQLTransactionAbortedError) / rollback
 * ```
 *
 * It is the SQLClient of the repositories while the transaction is active; statements issued after its end (a
 * promise left running by the operation) run on the fallback client, in autocommit.
 */
export class SQLTransactionState implements SQLClient {
  /**
   * The open connection, once the first statement opened it
   */
  protected connection?: SQLTransactionConnection;
  /**
   * Pending or completed opening of the connection
   */
  protected opening?: Promise<SQLTransactionConnection>;
  /**
   * Error of the first failed statement: the transaction can only roll back
   */
  protected failure?: { error: unknown };
  /**
   * True once committed or rolled back
   */
  protected finished = false;
  /**
   * Called when the transaction is rolled back
   */
  protected rollbackHooks: (() => void)[] = [];

  /**
   * @param open - open a connection and begin the transaction of this state on it
   * @param fallback - the client of the statements issued after the end
   * @param owner - the object owning the state (the store that created it)
   */
  constructor(
    protected readonly open: (state: SQLTransactionState) => Promise<SQLTransactionConnection>,
    protected readonly fallback: () => SQLClient | undefined,
    readonly owner?: object
  ) {}

  /**
   * @returns true once committed or rolled back
   */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * @returns true once a statement opened the connection
   */
  isOpen(): boolean {
    return this.connection !== undefined;
  }

  /**
   * Register a callback run when the transaction is rolled back (e.g. to forget a table created inside it)
   * @param hook - the callback
   */
  onRollback(hook: () => void): void {
    this.rollbackHooks.push(hook);
  }

  /**
   * Open the connection once, whatever the number of concurrent statements asking for it
   * @returns the connection
   */
  protected connect(): Promise<SQLTransactionConnection> {
    this.opening ??= this.open(this).then(connection => (this.connection = connection));
    return this.opening;
  }

  /**
   * Run a statement in the transaction, opening it on the first statement
   *
   * A failed statement aborts the transaction (PostgreSQL refuses any further statement, `25P02`): the next ones
   * throw a {@link SQLTransactionAbortedError} and the commit rolls back.
   * @param q - the statement
   * @param values - the parameters
   * @returns the result
   */
  async query(q: string, values?: any[]): Promise<{ rows: any[]; rowCount: number }> {
    if (this.finished) {
      return this.fallbackClient().query(q, values);
    }
    if (this.failure) {
      throw new SQLTransactionAbortedError(this.failure.error);
    }
    try {
      const connection = await this.connect();
      return await connection.client.query(q, values);
    } catch (err) {
      this.failure ??= { error: err };
      throw err;
    }
  }

  /**
   * @returns the client of the statements issued after the end
   */
  protected fallbackClient(): SQLClient {
    const client = this.fallback();
    if (!client) {
      throw new Error("No SQL client: the store is not initialized");
    }
    return client;
  }

  /**
   * Commit the transaction and release its connection; nothing to do when no statement opened it
   *
   * An aborted transaction is rolled back and a {@link SQLTransactionAbortedError} thrown. When COMMIT fails, a
   * ROLLBACK is attempted, the connection destroyed and the error thrown.
   */
  async commit(): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;
    if (!this.opening) {
      return;
    }
    let connection: SQLTransactionConnection;
    try {
      connection = await this.opening;
    } catch {
      // The connection never opened: the statements failed, nothing to release
      this.runRollbackHooks();
      throw new SQLTransactionAbortedError(this.failure?.error);
    }
    if (this.failure) {
      await this.rollbackConnection(connection);
      throw new SQLTransactionAbortedError(this.failure.error);
    }
    try {
      await connection.commit();
    } catch (err) {
      this.runRollbackHooks();
      await connection.rollback().catch(() => {
        /* the transaction may be gone already */
      });
      await connection.release(err);
      throw err;
    }
    await connection.release();
  }

  /**
   * Roll the transaction back and release its connection; nothing to do when no statement opened it
   * @param _error - the error failing the operation
   */
  async rollback(_error?: unknown): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;
    if (!this.opening) {
      this.runRollbackHooks();
      return;
    }
    let connection: SQLTransactionConnection;
    try {
      connection = await this.opening;
    } catch {
      this.runRollbackHooks();
      return;
    }
    await this.rollbackConnection(connection);
  }

  /**
   * ROLLBACK then release; a connection failing to roll back is destroyed and the error thrown
   * @param connection - the open connection
   */
  protected async rollbackConnection(connection: SQLTransactionConnection): Promise<void> {
    this.runRollbackHooks();
    try {
      await connection.rollback();
    } catch (err) {
      await connection.release(err);
      throw err;
    }
    await connection.release();
  }

  /**
   * Run the rollback hooks once
   */
  protected runRollbackHooks(): void {
    const hooks = this.rollbackHooks;
    this.rollbackHooks = [];
    hooks.forEach(hook => hook());
  }
}
