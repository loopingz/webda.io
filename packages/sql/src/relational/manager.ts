import { buildSchemaPlan } from "@webda/sql-schema";
import type { RelationalSchemaOptions, RelationalSchemaPlan, SchemaModelMetadata, TablePlan } from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import type { RelationalDialect, SchemaStep } from "./dialect.js";
import { TableMapping } from "./mapping.js";
import { SchemaDriftError, describeStep, planSchemaChanges } from "./sync.js";
import type { SchemaDrift, SchemaSyncMode } from "./sync.js";
import { runTransaction } from "./transaction.js";

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
  private mappings = new Map<string, TableMapping>();

  /**
   * @param options - the store's dialect, layout and logger
   */
  constructor(protected readonly options: RelationalSchemaManagerOptions) {}

  /**
   * Build the plan of the models of the store
   * @param models - the models of the store, subclasses included
   * @param knownModels - every application model, to type the references to other stores
   * @returns the plan
   * @throws SchemaBuildError when the models cannot share their tables
   */
  build(models: Iterable<SchemaModelMetadata>, knownModels: Iterable<SchemaModelMetadata>): RelationalSchemaPlan {
    this.plan = undefined;
    this.mappings.clear();
    const plan = buildSchemaPlan(models, { ...this.options.layout, knownModels });
    for (const warning of plan.warnings) {
      const where = warning.attribute ? `${warning.model}.${warning.attribute}` : warning.model;
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
   * @param model - a model identifier
   * @returns the mapping of its table (one per table), undefined when the model is not in the plan
   */
  mappingOf(model: string): TableMapping | undefined {
    const table = this.tableOf(model);
    if (!table) {
      return undefined;
    }
    let mapping = this.mappings.get(table.name);
    if (!mapping) {
      mapping = new TableMapping(this.plan!, table);
      this.mappings.set(table.name, mapping);
    }
    return mapping;
  }

  /**
   * @returns the DDL creating the whole plan on an empty database
   */
  createStatements(): string[] {
    return this.render(planSchemaChanges(this.requirePlan(), { tables: {} }, "create").steps);
  }

  /**
   * @param steps - schema changes
   * @returns their statements
   */
  protected render(steps: SchemaStep[]): string[] {
    return steps.flatMap(step => this.options.dialect.renderStep(step));
  }

  /**
   * Compare the database with the plan
   * @param client - the client
   * @returns what `alter` would apply, what it never resolves, and the statements
   */
  async diff(client: SQLClient): Promise<{ steps: SchemaStep[]; drift: SchemaDrift[]; statements: string[] }> {
    const plan = this.requirePlan();
    const live = await this.options.dialect.describeSchema(
      client,
      plan.tables.map(t => t.name)
    );
    const { steps, drift } = planSchemaChanges(plan, live, "alter");
    return { steps, drift, statements: this.render(steps) };
  }

  /**
   * Bring the database to the plan
   * @param client - a client whose statements run on one connection (the DDL runs in a transaction under the schema lock)
   * @param mode - what to do: nothing, create the missing tables, also extend the existing ones, or only check
   * @returns the applied steps
   * @throws SchemaDriftError in `validate` mode when anything is missing or differs
   */
  async sync(client: SQLClient, mode: SchemaSyncMode): Promise<SchemaStep[]> {
    if (mode === "none") {
      return [];
    }
    const plan = this.requirePlan();
    const live = await this.options.dialect.describeSchema(
      client,
      plan.tables.map(t => t.name)
    );
    const { steps, drift } = planSchemaChanges(plan, live, mode === "validate" ? "alter" : mode);
    if (mode === "validate") {
      if (steps.length || drift.length) {
        throw new SchemaDriftError(steps, drift);
      }
      return [];
    }
    for (const d of drift) {
      this.options.log("WARN", `${this.options.name}: ${d.message}`);
    }
    if (!steps.length) {
      return [];
    }
    await runTransaction(client, async tx => {
      const lock = this.options.dialect.schemaLock(this.options.name);
      if (lock) {
        await tx.query(lock);
      }
      for (const step of steps) {
        for (const statement of this.options.dialect.renderStep(step)) {
          await tx.query(statement);
        }
        this.options.log("INFO", `${this.options.name}: ${describeStep(step)}`);
      }
    });
    return steps;
  }
}
