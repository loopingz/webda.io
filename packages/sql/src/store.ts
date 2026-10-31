import {
  EventRepository,
  InstanceCache,
  registerOperationTransactionParticipant,
  runWithTransaction,
  Store,
  StoreParameters,
  UNREADABLE,
  UNTYPED,
  unregisterOperationTransactionParticipant,
  useModel,
  useModelMetadata,
  useOperationTransaction,
  WebdaError
} from "@webda/core";
import type {
  Context,
  MigratableStore,
  ModelClass,
  OperationDefinition,
  OperationTransactionParticipant,
  RawPage,
  RawPatch,
  RawTable,
  Repository,
  StoredTypeCounts
} from "@webda/core";
import type { SQLClient, SQLDatabase, SQLDialect } from "./dialect.js";
import { SQLRepository } from "./repository.js";
import { SQLTransactionState } from "./transaction.js";
import type { SQLTransactionConnection, SQLTransactionMode } from "./transaction.js";

/** Base parameters for SQL-backed stores */
export class SQLStoreParameters extends StoreParameters {
  /**
   * The table of every model of the store, subclasses and models routed to this store as fallback included (the
   * Webda 3 layout). Without it each model gets its own table (its identifier lowercased with "/" → "_").
   */
  table?: string;
  database?: SQLDatabase;
  /**
   * Auto create tables if they do not exist
   * @default true
   */
  autoCreateTable?: boolean;
  /**
   * Per-model table name overrides.
   * Maps a model identifier (e.g. "Webda/User") to a custom table name.
   */
  tables?: { [modelIdentifier: string]: string };
  /**
   * Wrap all statements of an operation in a single transaction
   *
   * - "none": autocommit per statement
   * - "operation": BEGIN on the first statement of an operation, COMMIT when the operation succeeds, ROLLBACK when
   *   it fails. Nested operations join the outermost one; `transaction: false` on an operation opts it out.
   * @default "none"
   */
  transaction?: SQLTransactionMode;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    this.autoCreateTable ??= true;
    this.tables ??= {};
    this.transaction ??= "none";
    return this;
  }
}

/**
 * Abstract base class for SQL-backed stores: one JSON document per row, a table per model (or one shared table),
 * repositories built on a {@link SQLDialect}, and the raw access of the migration commands
 */
export abstract class SQLStore<K extends SQLStoreParameters = SQLStoreParameters>
  extends Store<K>
  implements MigratableStore, OperationTransactionParticipant
{
  /**
   * Engine syntax, created once per store
   */
  protected readonly dialect: SQLDialect = this.createDialect();
  /**
   * Pending or completed `CREATE TABLE IF NOT EXISTS` per table name, so each table is
   * created once even when several repositories share it or statements run concurrently.
   */
  protected tablesReady = new Map<string, Promise<void>>();

  /**
   * @returns the engine syntax
   */
  protected abstract createDialect(): SQLDialect;

  /**
   * @returns the client statements run on, undefined while the store is not initialized
   */
  abstract getClient(): SQLClient | undefined;

  /**
   * Build the repository of a model: engines subclassing SQLRepository override this hook
   * @param model - the model class
   * @param table - the table name
   * @param tableModel - identifier of the model the table was declared for
   * @returns the repository, reading the client on each statement
   */
  protected createRepository<T extends ModelClass>(
    model: T,
    table: string,
    tableModel: string | undefined
  ): SQLRepository<T> {
    const meta = useModelMetadata(model);
    const repo: SQLRepository<T> = new SQLRepository<T>(
      model,
      meta.PrimaryKey,
      () => this.getClient(),
      table,
      meta.PrimaryKeySeparator,
      () => this.ensureTable(repo),
      tableModel,
      this.dialect,
      () => this.getTransactionClient()
    );
    return repo;
  }

  /**
   * Register the store as a transaction participant of the operations when `transaction` is "operation"
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    if (this.parameters.transaction === "operation") {
      this.checkTransactionSupport();
      registerOperationTransactionParticipant(this);
    }
    return this;
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    unregisterOperationTransactionParticipant(this);
    this.tablesReady.clear();
    await super.stop();
  }

  /**
   * Participant enlisted by {@link withTransaction}, whatever the `transaction` mode
   */
  protected explicitParticipant?: OperationTransactionParticipant;

  /**
   * Key of the transaction state in the operation transaction: stores sharing one connection share it
   * @returns the key
   */
  protected transactionKey(): string {
    return `sql.tx.${this.getName()}`;
  }

  /**
   * Check the store can run transactions with its configuration
   * @throws WebdaError.CodeError when it cannot
   */
  protected checkTransactionSupport(): void {
    // Engines refusing some configuration override this
  }

  /**
   * Open a connection dedicated to a transaction and begin it
   * @param _state - the transaction state the connection is opened for
   * @returns the connection, BEGIN run
   */
  protected async openTransaction(_state: SQLTransactionState): Promise<SQLTransactionConnection> {
    throw new WebdaError.CodeError(
      "SQL_TRANSACTION_UNSUPPORTED",
      `${this.constructor.name} ${this.getName()} does not support transactions`
    );
  }

  /**
   * @returns the transaction state of this store in the current async chain, while active
   */
  protected getTransactionState(): SQLTransactionState | undefined {
    const state = useOperationTransaction()?.get<SQLTransactionState>(this.transactionKey());
    return state && !state.isFinished() ? state : undefined;
  }

  /**
   * The client of the transaction the current async chain runs in (an operation or {@link withTransaction})
   *
   * Statements on it open the transaction connection on first use.
   * @returns the client, undefined outside a transaction of this store
   */
  getTransactionClient(): SQLClient | undefined {
    return this.getTransactionState();
  }

  /**
   * Create the transaction state of this store in the current transaction, unless it has one already
   */
  protected enlistTransaction(): void {
    const transaction = useOperationTransaction();
    const key = this.transactionKey();
    if (!transaction || transaction.get(key)) {
      return;
    }
    transaction.set(
      key,
      new SQLTransactionState(
        state => this.openTransaction(state),
        () => this.getClient(),
        this
      )
    );
  }

  /**
   * @returns the transaction state created by this store in the current transaction
   */
  protected ownTransactionState(): SQLTransactionState | undefined {
    const state = useOperationTransaction()?.get<SQLTransactionState>(this.transactionKey());
    return state?.owner === this ? state : undefined;
  }

  /**
   * Take part in the transaction of an operation: nothing is opened until the first statement
   * @param _context - the execution context
   * @param operation - the operation, its `transaction: false` keeps the store out
   */
  async begin(_context: Context, operation?: OperationDefinition): Promise<void> {
    if (this.parameters.transaction !== "operation" || operation?.transaction === false) {
      return;
    }
    this.enlistTransaction();
  }

  /**
   * Commit the transaction of the operation, when a statement opened it
   * @param _context - the execution context
   */
  async commit(_context: Context): Promise<void> {
    await this.ownTransactionState()?.commit();
  }

  /**
   * Roll back the transaction of the operation, when a statement opened it
   * @param _context - the execution context
   * @param error - the error failing the operation
   */
  async rollback(_context: Context, error: unknown): Promise<void> {
    await this.ownTransactionState()?.rollback(error);
  }

  /**
   * Run a function in a transaction of this store, for code outside operations (CLI, queue workers, tests)
   *
   * Committed when the function resolves, rolled back when it throws. Inside an operation or another transaction,
   * the store joins it: the work is committed with it. Works whatever the `transaction` mode.
   * @param fn - the function
   * @returns the function result
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.checkTransactionSupport();
    this.explicitParticipant ??= {
      name: this.getName(),
      begin: async () => this.enlistTransaction(),
      commit: context => this.commit(context),
      rollback: (context, error) => this.rollback(context, error)
    };
    return runWithTransaction(fn, [this.explicitParticipant]);
  }

  /**
   * Resolve the table name for a given model class.
   *
   * Resolution order:
   * 1. `parameters.tables[meta.Identifier]` — explicit per-model override
   * 2. `parameters.table` — the table of every model of the store, subclasses and models routed to this store as
   *    fallback included: the rows stay where Webda 3 wrote them
   * 3. Default — model identifier lowercased with "/" replaced by "_"
   *
   * @param model - the model class to resolve the table for
   * @returns the table name
   */
  resolveTable(model: ModelClass): string {
    const meta = useModelMetadata(model);
    if (!meta) {
      return this.parameters.table!;
    }
    // Explicit per-model override
    if (this.parameters.tables?.[meta.Identifier]) {
      return this.parameters.tables[meta.Identifier];
    }
    if (this.parameters.table) {
      return this.parameters.table;
    }
    // Default derivation
    return meta.Identifier.toLowerCase().replace(/\//g, "_");
  }

  /**
   * The model a table was declared for, owner of the rows written before `__type` stamping: the first model of
   * `models` stored in the same table, otherwise the model itself (its own table)
   * @param model - the model class
   * @returns the model identifier
   */
  resolveTableModel(model: ModelClass): string | undefined {
    const meta = useModelMetadata(model);
    if (!meta) {
      return undefined;
    }
    return this.tableRootOf(this.resolveTable(model))?.Metadata?.Identifier ?? meta.Identifier;
  }

  /**
   * The first model of `models` stored in a table
   * @param table - the table name
   * @returns the model, undefined when no configured model is stored in it
   */
  protected tableRootOf(table: string): any {
    for (const identifier of this.parameters.models ?? []) {
      let model: any;
      try {
        model = useModel(identifier);
      } catch {
        continue;
      }
      if (model && this.resolveTable(model) === table) {
        return model;
      }
    }
    return undefined;
  }

  /**
   * Stamp `__type` on the rows written before stamping, with the model each table was declared for
   *
   * Idempotent: run it once after upgrading, before relying on the class filter of shared tables (rows without
   * `__type` are read as the table model until then).
   * @returns the number of rows stamped
   */
  async backfillTypes(): Promise<number> {
    let count = 0;
    for (const repo of this.getRepositories()) {
      count += await repo.backfillTypes();
    }
    return count;
  }

  /**
   * Ensure all managed model tables exist (one per model in the hierarchy).
   * When `autoCreateTable` is false, this is a no-op.
   */
  async checkTable() {
    if (!this.parameters.autoCreateTable) {
      return;
    }
    // Delegate the per-model DDL to each repository setupTable().
    // ensureTable deduplicates by table name so shared-table models don't issue redundant DDL.
    for (const repo of this.getRepositories()) {
      await this.ensureTable(repo);
    }
  }

  /**
   * Ensure the table backing a repository exists, once per table name.
   * Repositories await it before their first statement, so models routed to this store
   * after init (e.g. Registry fallback in Store.computeStores) get their table too.
   * When `autoCreateTable` is false, this is a no-op.
   * @param repo - the repository whose table to create
   */
  async ensureTable(repo: SQLRepository<any>): Promise<void> {
    if (!this.parameters.autoCreateTable) {
      return;
    }
    const table = repo.getTable();
    let ready = this.tablesReady.get(table);
    if (!ready) {
      ready = repo.setupTable();
      const created = ready;
      this.tablesReady.set(table, created);
      // Allow a retry after a failed creation
      const forget = () => this.tablesReady.get(table) === created && this.tablesReady.delete(table);
      created.catch(forget);
      // On a single-connection engine the DDL runs inside the open transaction: forget it if it rolls back
      const state = this.getTransactionState();
      if (state?.isOpen()) {
        state.onRollback(forget);
      }
    }
    await ready;
  }

  /**
   * Build and return a repository for the given model, using the per-model table name resolved by
   * `resolveTable`. The repository ensures its table exists (see {@link ensureTable}) before its first statement.
   *
   * The result is cached per model class via `@InstanceCache`, and may be requested before `init()`
   * (Store.computeStores runs from the first store to initialize): the repository reads the client on each
   * statement, so it follows the one connected by `init()` and the reconnection after a `stop()`.
   * @param model - the model class
   * @returns a repository backed by this store's connection
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const inner = this.createRepository(model, this.resolveTable(model), this.resolveTableModel(model));
    // Wrap in EventRepository so typed CRUD events fire; consumers reach them
    // via useRepository(model).on(...).
    return new EventRepository<T>(model, meta.PrimaryKey, inner, meta.PrimaryKeySeparator) as unknown as Repository<T>;
  }

  /**
   * Return the underlying SQLRepository for each model this store manages,
   * unwrapping the EventRepository produced by {@link getRepository}.
   * @returns the per-model repository instances
   */
  getRepositories(): SQLRepository<any>[] {
    const repos: SQLRepository<any>[] = [];
    for (const modelId of Object.keys(this._modelsHierarchy ?? {})) {
      let model: ModelClass | undefined;
      try {
        model = useModel(modelId);
      } catch {
        continue;
      }
      if (!model) {
        continue;
      }
      const repo: any = this.getRepository(model);
      repos.push((repo.repository ?? repo) as SQLRepository<any>);
    }
    return repos;
  }

  /**
   * Every table of the store, each with the model owning its untyped rows
   * @override
   */
  getRawTables(): RawTable[] {
    const names = new Set<string>();
    if (this.parameters.table) {
      names.add(this.parameters.table);
    }
    for (const repo of this.getRepositories()) {
      names.add(repo.getTable());
    }
    return [...names].map(name => ({
      name,
      root:
        this.tableRootOf(name) ??
        this.getRepositories().find(repo => repo.getTable() === name)?.["model"] ??
        this.getTableRoot()
    }));
  }

  /**
   * Refuse a table this store does not manage: the name is written in the statements
   * @param table - the table name
   */
  protected checkRawTable(table: string): void {
    if (!this.getRawTables().some(t => t.name === table)) {
      throw new Error(`Unknown table ${table} in store ${this.getName()}`);
    }
  }

  /**
   * Rows ordered by key, the token is the last key of the page
   * @override
   */
  async rawPages(table: string, batchSize: number, token?: string): Promise<RawPage> {
    this.checkRawTable(table);
    const p = (i: number) => this.dialect.placeholder(i);
    // The key is compared in the column own type (Webda 3 created some `uuid` columns as uuid), with its index
    const res =
      token === undefined
        ? await this.getClient()!.query(`SELECT uuid, data FROM ${table} ORDER BY uuid LIMIT ${p(1)}`, [batchSize + 1])
        : await this.getClient()!.query(
            `SELECT uuid, data FROM ${table} WHERE uuid > ${p(1)} ORDER BY uuid LIMIT ${p(2)}`,
            [token, batchSize + 1]
          );
    const rows = res.rows.slice(0, batchSize).map(row => {
      let data: any;
      try {
        data = this.dialect.decode(row.data);
      } catch {
        data = undefined;
      }
      return data && typeof data === "object" && !Array.isArray(data)
        ? { table, key: row.uuid, data }
        : { table, key: row.uuid, data: {}, unreadable: true };
    });
    return {
      rows,
      continuationToken: res.rows.length > batchSize ? rows[rows.length - 1].key : undefined
    };
  }

  /**
   * Merge the fields into the row: one statement, no read
   * @override
   */
  async rawPatch(table: string, key: string, patch: RawPatch): Promise<void> {
    this.checkRawTable(table);
    const args: any[] = [];
    const merged = this.dialect.shallowMerge("data", patch, args);
    args.push(key);
    const res = await this.getClient()!.query(
      `UPDATE ${table} SET data = ${merged} WHERE uuid = ${this.dialect.placeholder(args.length)} AND ${this.dialect.isObjectRow()}`,
      args
    );
    if (res.rowCount === 0) {
      throw new Error(`Raw row not found or not a JSON object: ${key}`);
    }
  }

  /**
   * Exact counts with one `GROUP BY` per table: never truncated
   * @override
   */
  async countStoredTypes(_maxRows: number): Promise<StoredTypeCounts> {
    const result: StoredTypeCounts = { tables: {}, truncated: false };
    for (const { name } of this.getRawTables()) {
      const counts: Record<string, number> = {};
      const res = await this.getClient()!.query(this.dialect.countStoredTypes(name), [UNREADABLE, UNTYPED]);
      for (const row of res.rows) {
        counts[row.type] = Number(row.n);
      }
      result.tables[name] = counts;
    }
    return result;
  }

  /**
   * Delete all rows from all managed tables (used in tests).
   */
  async __clean(): Promise<void> {
    const tables = new Set<string>();
    if (this.parameters.table) {
      tables.add(this.parameters.table);
    }
    for (const modelId of Object.keys(this._modelsHierarchy ?? {})) {
      try {
        const model = useModel(modelId);
        if (model) {
          tables.add(this.resolveTable(model));
        }
      } catch {
        // skip unreachable models
      }
    }
    for (const table of tables) {
      await this.getClient()!.query(`DELETE FROM ${table}`);
    }
  }
}
