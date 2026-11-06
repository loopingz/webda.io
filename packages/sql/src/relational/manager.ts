import { buildSchemaPlan } from "@webda/sql-schema";
import type {
  LiveSchemaPlan,
  ReferencedTable,
  RelationalSchemaOptions,
  RelationalSchemaPlan,
  SchemaModelMetadata,
  TablePlan
} from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import { describeContractStep, planContract } from "./contract.js";
import type { ContractStep } from "./contract.js";
import type { LiveSchema, OnlineStatements, RelationalDialect, SchemaStep } from "./dialect.js";
import { SchemaDriftError, describeStep, planSchemaChanges } from "./sync.js";
import type { SchemaDrift, SchemaSyncMode } from "./sync.js";
import { runTransaction } from "./transaction.js";

/**
 * What runs around the DDL of {@link RelationalSchemaManager.sync}: the multi-version registry
 *
 * Under the schema lock, `check` runs before the database is described and `register` after the DDL, so the live
 * versions cannot change between the check and the DDL. A caller that cannot read the registry under the lock (one
 * connection shared with the registry) gives `live` instead and registers itself afterwards.
 */
export interface SchemaSyncHooks {
  /**
   * Read the live versions and refuse an incompatible plan
   * @returns the plans of the live versions: their columns are never reported as drift
   */
  check?: () => Promise<LiveSchemaPlan[]>;
  /**
   * The plans of the live versions, when `check` ran before
   */
  live?: LiveSchemaPlan[];
  /**
   * Record this version as live, under the lock
   */
  register?: () => Promise<void>;
}

/**
 * What a relational store gives its schema manager
 */
export interface RelationalSchemaManagerOptions {
  /**
   * The store name: lock key and log prefix
   */
  name: string;
  dialect: RelationalDialect;
  /**
   * Layout options of the plan (`tables`, `columnNaming`, `extraColumn`, `foreignKeys`, `numericAsDecimal`)
   */
  layout: RelationalSchemaOptions;
  log: (level: "WARN" | "INFO" | "DEBUG", message: string) => void;
}

/**
 * Holds the plan of a relational store and brings the database to it: builds the plan from the model metadata,
 * creates or extends the tables (never destructively) and reports what differs
 */
export class RelationalSchemaManager {
  /**
   * The plan, once {@link build} ran
   */
  plan: RelationalSchemaPlan | undefined;

  /**
   * @param options - the store's dialect, layout and logger
   */
  constructor(protected readonly options: RelationalSchemaManagerOptions) {}

  /**
   * Build the plan of the models of the store
   * @param models - the models of the store, subclasses included
   * @param knownModels - every application model, to type the references to other stores
   * @param referencedTables - the tables of other stores a foreign key may reference, by model identifier
   * @returns the plan
   * @throws SchemaBuildError when the models cannot share their tables
   */
  build(
    models: Iterable<SchemaModelMetadata>,
    knownModels: Iterable<SchemaModelMetadata>,
    referencedTables?: { [identifier: string]: ReferencedTable }
  ): RelationalSchemaPlan {
    this.plan = undefined;
    const plan = buildSchemaPlan(models, { ...this.options.layout, knownModels, referencedTables });
    for (const warning of plan.warnings) {
      const where = [warning.model, warning.attribute].filter(Boolean).join(".");
      this.options.log("WARN", `${warning.code} ${where}: ${warning.message}`);
    }
    this.plan = plan;
    return plan;
  }

  /**
   * @returns the plan
   * @throws when {@link build} did not run
   */
  protected requirePlan(): RelationalSchemaPlan {
    if (!this.plan) {
      throw new Error(`Schema plan of ${this.options.name} not built`);
    }
    return this.plan;
  }

  /**
   * @param model - a model identifier
   * @returns its table, undefined when the model is not in the plan
   */
  tableOf(model: string): TablePlan | undefined {
    const table = this.plan?.models[model]?.table;
    return table ? this.plan!.tables.find(t => t.name === table) : undefined;
  }

  /**
   * @returns the DDL creating the whole plan on an empty database
   */
  createStatements(): string[] {
    return this.render(planSchemaChanges(this.requirePlan(), { tables: {} }, "create", this.planOptions()).steps);
  }

  /**
   * @returns the planner options of the dialect
   */
  protected planOptions(): { inlineForeignKeys?: boolean } {
    return { inlineForeignKeys: this.options.dialect.inlineForeignKeys };
  }

  /**
   * @param steps - schema changes
   * @returns their statements
   */
  protected render(steps: SchemaStep[]): string[] {
    return steps.flatMap(step => this.options.dialect.renderStep(step));
  }

  /**
   * The additive changes and the drift of a database, the columns of the live versions left out of the drift
   * @param live - the database
   * @param mode - `create` or `alter`
   * @param livePlans - the plans of the live versions
   * @returns the steps and the drift
   */
  protected changes(
    live: LiveSchema,
    mode: "create" | "alter",
    livePlans: LiveSchemaPlan[]
  ): { steps: SchemaStep[]; drift: SchemaDrift[] } {
    const plan = this.requirePlan();
    const { steps, drift } = planSchemaChanges(plan, live, mode, this.planOptions());
    const known = (table: string, column: string) =>
      livePlans.some(({ plan: p }) => p.tables.some(t => t.name === table && t.columns.some(c => c.name === column)));
    const planned = (table: string, column: string) =>
      plan.tables.some(t => t.name === table && t.columns.some(c => c.name === column));
    return {
      steps,
      drift: drift.filter(d => !(d.column && !planned(d.table, d.column) && known(d.table, d.column)))
    };
  }

  /**
   * Compare the database with the plan
   * @param client - the client
   * @param livePlans - the plans of the live versions: their columns are not drift
   * @returns what `alter` would apply, what it never resolves, and the statements
   */
  async diff(
    client: SQLClient,
    livePlans: LiveSchemaPlan[] = []
  ): Promise<{ steps: SchemaStep[]; drift: SchemaDrift[]; statements: string[] }> {
    const plan = this.requirePlan();
    const live = await this.options.dialect.describeSchema(
      client,
      plan.tables.map(t => t.name)
    );
    const { steps, drift } = this.changes(live, "alter", livePlans);
    return { steps, drift, statements: this.render(steps) };
  }

  /**
   * Bring the database to the plan
   *
   * `create` and `alter` take the schema lock in a transaction, describe the database under it, apply the additive
   * steps and commit; the `online` steps the dialect keeps out of the transaction (`CREATE INDEX CONCURRENTLY`,
   * `VALIDATE CONSTRAINT`) run afterwards, one by one, and a failing one is logged and left out.
   * @param client - a client whose statements run on one connection (the DDL runs in a transaction under the schema lock)
   * @param mode - what to do: nothing, create the missing tables, also extend the existing ones, or only check
   * @param hooks - the registry hooks
   * @returns the applied steps
   * @throws SchemaDriftError in `validate` mode when anything is missing or differs
   */
  async sync(client: SQLClient, mode: SchemaSyncMode, hooks: SchemaSyncHooks = {}): Promise<SchemaStep[]> {
    const plan = this.requirePlan();
    const check = async () => (hooks.check ? await hooks.check() : (hooks.live ?? []));
    if (mode === "none") {
      await check();
      await hooks.register?.();
      return [];
    }
    const describe = (c: SQLClient) =>
      this.options.dialect.describeSchema(
        c,
        plan.tables.map(t => t.name)
      );
    if (mode === "validate") {
      const livePlans = await check();
      const { steps, drift } = this.changes(await describe(client), "alter", livePlans);
      if (steps.length || drift.length) {
        throw new SchemaDriftError(steps, drift);
      }
      await hooks.register?.();
      return [];
    }
    let applied: SchemaStep[] = [];
    const deferred: { step: SchemaStep; online: OnlineStatements }[] = [];
    await runTransaction(client, async tx => {
      const lock = this.options.dialect.schemaLock(this.options.name);
      if (lock) {
        await tx.query(lock);
      }
      const livePlans = await check();
      const { steps, drift } = this.changes(await describe(tx), mode, livePlans);
      for (const d of drift) {
        this.options.log("WARN", `${this.options.name}: ${d.message}`);
      }
      for (const step of steps) {
        const online =
          (step.kind === "createIndex" || step.kind === "addForeignKey") && step.online
            ? this.options.dialect.renderOnlineStep?.(step)
            : undefined;
        for (const statement of online ? online.inside : this.options.dialect.renderStep(step)) {
          await tx.query(statement);
        }
        if (online?.after.length) {
          deferred.push({ step, online });
        } else {
          this.options.log("INFO", `${this.options.name}: ${describeStep(step)}`);
        }
      }
      applied = steps;
      await hooks.register?.();
    });
    for (const { step, online } of deferred) {
      try {
        for (const statement of online.after) {
          await client.query(statement);
        }
        this.options.log("INFO", `${this.options.name}: ${describeStep(step)} (online)`);
      } catch (err) {
        this.options.log(
          "WARN",
          `${this.options.name}: ${describeStep(step)} failed online and is left out: ${(err as Error).message}`
        );
        for (const statement of online.onFailure ?? []) {
          await client.query(statement);
        }
      }
    }
    return applied;
  }

  /**
   * What the contract phase can apply: the database of every table any version planned, compared with the union of
   * the live plans
   * @param client - the client
   * @param live - the plans of the live versions, this one included
   * @param retired - the plans of the retired and expired versions
   * @returns the steps and their statements (empty for a step the engine cannot run)
   */
  async contract(
    client: SQLClient,
    live: LiveSchemaPlan[],
    retired: RelationalSchemaPlan[]
  ): Promise<{ step: ContractStep; statements: string[] }[]> {
    const tables = new Set<string>();
    for (const plan of [...live.map(l => l.plan), ...retired]) {
      plan.tables.forEach(t => tables.add(t.name));
    }
    const db = await this.options.dialect.describeSchema(client, [...tables]);
    return planContract(live, db, retired).map(step => ({
      step,
      statements: this.options.dialect.renderContractStep?.(step) ?? []
    }));
  }

  /**
   * Apply contract steps: the drops and `NOT NULL` in one transaction under the schema lock (a `NOT NULL` is skipped
   * when a row is null), the validations after it
   * @param client - a client whose statements run on one connection
   * @param steps - the steps with their statements
   * @returns the applied steps
   */
  async applyContract(
    client: SQLClient,
    steps: { step: ContractStep; statements: string[] }[]
  ): Promise<ContractStep[]> {
    const applied: ContractStep[] = [];
    const q = (id: string) => this.options.dialect.quote(id);
    const transactional = steps.filter(s => s.statements.length && s.step.kind !== "validateForeignKey");
    if (transactional.length) {
      await runTransaction(client, async tx => {
        const lock = this.options.dialect.schemaLock(this.options.name);
        if (lock) {
          await tx.query(lock);
        }
        for (const { step, statements } of transactional) {
          if (step.kind === "setNotNull") {
            const nulls = await tx.query(`SELECT COUNT(*) AS n FROM ${q(step.table)} WHERE ${q(step.column)} IS NULL`);
            if (Number(nulls.rows[0].n) > 0) {
              this.options.log(
                "WARN",
                `${this.options.name}: ${describeContractStep(step)} skipped: ${nulls.rows[0].n} null row(s)`
              );
              continue;
            }
          }
          for (const statement of statements) {
            await tx.query(statement);
          }
          this.options.log("INFO", `${this.options.name}: ${describeContractStep(step)}`);
          applied.push(step);
        }
      });
    }
    for (const { step, statements } of steps.filter(s => s.statements.length && s.step.kind === "validateForeignKey")) {
      for (const statement of statements) {
        await client.query(statement);
      }
      this.options.log("INFO", `${this.options.name}: ${describeContractStep(step)}`);
      applied.push(step);
    }
    return applied;
  }

  /**
   * Copy a column into another one, by batches of rows where the target is null and the source is not: the
   * expand/contract step between the addition of a column and the switch of the reads
   * @param client - the client
   * @param table - the table
   * @param from - the source column
   * @param to - the target column
   * @param batch - rows per statement
   * @returns the number of rows updated
   * @throws when the table or a column is not in the plan
   */
  async backfill(client: SQLClient, table: string, from: string, to: string, batch: number = 1000): Promise<number> {
    const plan = this.requirePlan();
    const target = plan.tables.find(t => t.name === table);
    if (!target) {
      throw new Error(`Table ${table} is not in the plan of ${this.options.name}`);
    }
    for (const column of [from, to]) {
      if (!target.columns.some(c => c.name === column)) {
        throw new Error(`Column ${table}.${column} is not in the plan of ${this.options.name}`);
      }
    }
    const q = (id: string) => this.options.dialect.quote(id);
    const keys = target.primaryKey.map(q).join(", ");
    const size = Math.max(1, Math.floor(batch));
    const statement =
      `UPDATE ${q(table)} SET ${q(to)} = ${q(from)} WHERE (${keys}) IN ` +
      `(SELECT ${keys} FROM ${q(table)} WHERE ${q(to)} IS NULL AND ${q(from)} IS NOT NULL LIMIT ${size})`;
    let total = 0;
    for (;;) {
      const { rowCount } = await client.query(statement);
      total += rowCount;
      this.options.log("DEBUG", `${this.options.name}: backfill ${table}.${from} -> ${to}: ${total} row(s)`);
      if (rowCount < size) {
        return total;
      }
    }
  }
}
