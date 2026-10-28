import { Container, CosmosClient, PatchOperation, SqlQuerySpec } from "@azure/cosmos";
import {
  EventRepository,
  InstanceCache,
  MemoryRepository,
  ModelClass,
  Repository,
  SecretString,
  Store,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  useModelMetadata,
  WebdaError
} from "@webda/core";
import * as QL from "@webda/ql";
import { AzureServiceParameters, getAzureCredential, loadAzureParameters } from "./azure-parameters.js";
import { AzureContributor, AzureDeployerInfo, AzureResourceContribution } from "./contributors.js";

/** Cosmos DB NoSQL settings. All models in the store share a typed container. */
export class CosmosStoreParameters extends StoreParameters implements AzureServiceParameters {
  endpoint!: string;
  key?: string | SecretString;
  database!: string;
  container!: string;
  partitionKey = "/id";
  createIfNotExists = false;
  throughput?: number;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string | SecretString;
  subscriptionId?: string;

  /**
   * Perform load.
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    return loadAzureParameters(this);
  }
}

/**
 * Translate the supported WebdaQL filter subset with bound values and quoted field identifiers.
 * @param query - WebdaQL query or parsed filter
 * @returns SQL text and bound parameters
 */
export function cosmosQuery(query: QL.Query): SqlQuerySpec {
  const parameters: NonNullable<SqlQuerySpec["parameters"]> = [];
  const field = (path: string[]) =>
    (path[0] === "__type" ? "c" : 'c["value"]') + path.map(part => `[${JSON.stringify(part)}]`).join("");
  const bind = (value: any) => {
    const name = `@p${parameters.length}`;
    parameters.push({ name, value });
    return name;
  };
  const translate = (expression: QL.Expression): string => {
    if (expression instanceof QL.BooleanExpression) return expression.value ? "true" : "false";
    if (expression instanceof QL.AndExpression || expression instanceof QL.OrExpression) {
      return expression.children.length
        ? `(${expression.children.map(translate).join(` ${expression.operator} `)})`
        : expression.operator === "AND"
          ? "true"
          : "false";
    }
    if (!(expression instanceof QL.ComparisonExpression))
      throw new WebdaError.NotImplemented("Unsupported Cosmos query expression");
    const attribute = field(expression.attribute),
      value = expression.value;
    switch (expression.operator) {
      case "=":
      case "!=":
      case ">":
      case ">=":
      case "<":
      case "<=":
        return `${attribute} ${expression.operator} ${bind(value)}`;
      case "IN":
        return `ARRAY_CONTAINS(${bind(value)}, ${attribute})`;
      case "CONTAINS":
        return `ARRAY_CONTAINS(${attribute}, ${bind(value)})`;
      case "LIKE":
        return `${attribute} LIKE ${bind(value)}`;
      case "IS NULL":
        return `(NOT IS_DEFINED(${attribute}) OR IS_NULL(${attribute}))`;
      case "IS NOT NULL":
        return `(IS_DEFINED(${attribute}) AND NOT IS_NULL(${attribute}))`;
      default:
        throw new WebdaError.NotImplemented(`Unsupported Cosmos query operator ${expression.operator}`);
    }
  };
  const filter = translate(query.filter);
  const order = query.orderBy?.map(item => `${field(item.field.split("."))} ${item.direction}`).join(", ");
  return { query: `SELECT * FROM c WHERE ${filter}${order ? ` ORDER BY ${order}` : ""}`, parameters };
}

type CosmosDocument = Record<string, any> & { id: string; value: Record<string, any>; _etag?: string };

/** Typed Cosmos repository. A serializer envelope preserves dates, behaviors and concrete model types. */
export class CosmosRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * Initialize the Azure integration.
   * @param model - Model class or model identifier
   * @param pks - Primary key field names
   * @param container - Lazy Cosmos container accessor
   * @param partitionKey - Cosmos partition key path
   * @param separator - Composite primary key separator
   */
  constructor(
    model: T,
    pks: string[],
    protected container: () => Container,
    protected partitionKey = "/id",
    separator?: string
  ) {
    super(model, pks, separator);
    if (
      partitionKey !== "/id" &&
      (!/^\/[a-zA-Z]\w*$/.test(partitionKey) ||
        !pks.includes(partitionKey.slice(1)) ||
        ["value", "__type", "constructor", "prototype"].includes(partitionKey.slice(1)))
    ) {
      throw new WebdaError.BadRequest("A custom Cosmos partition key must name a top-level primary key field");
    }
  }

  /**
   * Encode the model primary key as a Cosmos item identifier.
   * @param primaryKey - Model primary key
   * @returns The key result
   */
  protected key(primaryKey: any): string {
    return Buffer.from(this.getPrimaryKey(primaryKey).toString()).toString("base64url");
  }
  /**
   * Resolve the partition value from the primary key.
   * @param primaryKey - Model primary key
   * @returns The partition result
   */
  protected partition(primaryKey: any): string | number | boolean {
    if (this.partitionKey === "/id") return this.key(primaryKey);
    const value = (this.getPrimaryKey(primaryKey, true) as any)[this.partitionKey.slice(1)];
    if (!["string", "number", "boolean"].includes(typeof value))
      throw new WebdaError.BadRequest("Cosmos partition key requires a scalar value");
    return value;
  }
  /**
   * Address a Cosmos document by its item and partition keys.
   * @param primaryKey - Model primary key
   * @returns The item result
   */
  protected item(primaryKey: any) {
    return this.container().item(this.key(primaryKey), this.partition(primaryKey));
  }
  /**
   * Serialize a model into a typed Cosmos document.
   * @param item - Collection item or model instance
   * @returns The document result
   */
  protected document(item: InstanceType<T>): CosmosDocument {
    return {
      ...JSON.parse(this.serialize(item)),
      id: this.key(item),
      ...(this.partitionKey === "/id" ? {} : { [this.partitionKey.slice(1)]: this.partition(item) })
    };
  }
  /**
   * Restore a typed model from a Cosmos document.
   * @param document - Stored Cosmos document
   * @returns The from document result
   */
  protected fromDocument(document: CosmosDocument): InstanceType<T> {
    const {
      id: _id,
      _etag: _etag,
      _rid: _rid,
      _self: _self,
      _attachments: _attachments,
      _ts: _ts,
      ...envelope
    } = document;
    if (this.partitionKey !== "/id") delete envelope[this.partitionKey.slice(1)];
    return this.deserialize(JSON.stringify(envelope));
  }
  /**
   * Map Cosmos storage errors to Webda errors.
   * @param primaryKey - Model primary key
   * @param error - Azure SDK error
   */
  protected translateError(primaryKey: any, error: unknown): never {
    const code = (error as { code?: number }).code;
    if (code === 404) throw new StoreNotFoundError(primaryKey, this.container().id);
    if (code === 412) throw new UpdateConditionFailError(primaryKey, "_etag", "current version");
    if (code === 409) throw new WebdaError.Conflict("Cosmos item already exists");
    throw error;
  }
  /**
   * Read a Cosmos document or raise the store not-found error.
   * @param primaryKey - Model primary key
   * @returns The read result
   */
  protected async read(primaryKey: any): Promise<CosmosDocument> {
    try {
      const { resource } = await this.item(primaryKey).read<CosmosDocument>();
      if (!resource) throw new StoreNotFoundError(primaryKey, this.container().id);
      return resource;
    } catch (error) {
      this.translateError(primaryKey, error);
    }
  }

  /**
   * Perform get.
   * @override
   */
  async get(primaryKey: any): Promise<any> {
    return this.fromDocument(await this.read(primaryKey));
  }
  /**
   * Perform exists.
   * @override
   */
  async exists(primaryKey: any): Promise<boolean> {
    try {
      await this.read(primaryKey);
      return true;
    } catch (error) {
      if (error instanceof StoreNotFoundError) return false;
      throw error;
    }
  }
  /**
   * Perform create.
   * @override
   */
  async create(data: any, save = true): Promise<InstanceType<T>> {
    const item = this.buildItem(data);
    if (save) {
      try {
        await this.container().items.create(this.document(item));
      } catch (error) {
        this.translateError(this.getPrimaryKey(item), error);
      }
    }
    return item;
  }

  /**
   * Validate a write condition against the current document.
   * @param primaryKey - Model primary key
   * @param document - Stored Cosmos document
   * @param field - Conditional write field
   * @param expected - Expected field value
   */
  protected checkWriteCondition(
    primaryKey: any,
    document: CosmosDocument,
    field?: string | null,
    expected?: any
  ): void {
    if (!field) return;
    const actual =
      field === "_etag"
        ? document._etag
        : field.split(".").reduce((value, key) => value?.[key], this.fromDocument(document) as any);
    if (
      (actual instanceof Date ? actual.toISOString() : actual) !==
      (expected instanceof Date ? expected.toISOString() : expected)
    ) {
      throw new UpdateConditionFailError(primaryKey, field, expected);
    }
  }

  /**
   * Use the shared model mutation helpers, then submit the complete change atomically under the read ETag.
   * @param primaryKey - Model primary key
   * @param change - Model mutation applied through shared repository helpers
   * @param conditionField - Conditional write field
   * @param condition - Expected write condition
   * @param native - Native atomic Cosmos patch operations
   */
  protected async mutate(
    primaryKey: any,
    change: (repository: MemoryRepository<T>) => Promise<unknown>,
    conditionField?: string | null,
    condition?: any,
    native?: PatchOperation[]
  ): Promise<void> {
    const original = await this.read(primaryKey);
    this.checkWriteCondition(primaryKey, original, conditionField, condition);
    const key = this.getPrimaryKey(primaryKey).toString();
    const memory = new MemoryRepository(
      this.model,
      this.pks,
      this.separator,
      new Map([[key, this.serialize(this.fromDocument(original))]])
    );
    await change(memory);
    const updated = this.document((await memory.get(primaryKey)) as InstanceType<T>);
    if (updated.id !== original.id) throw new WebdaError.BadRequest("Cannot change a Cosmos primary key");
    const operations: PatchOperation[] = native ?? [];
    const path = (name: string) => `/value/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    if (!native) {
      for (const [name, value] of Object.entries(updated.value)) {
        if (JSON.stringify(value) !== JSON.stringify(original.value[name]))
          operations.push({ op: "set", path: path(name), value });
      }
      for (const name of Object.keys(original.value))
        if (!(name in updated.value)) operations.push({ op: "remove", path: path(name) });
    }
    if (JSON.stringify(updated.$serializer) !== JSON.stringify(original.$serializer))
      operations.push({ op: "set", path: "/$serializer", value: updated.$serializer });
    if (!operations.length) return;
    if (operations.length > 10)
      throw new WebdaError.BadRequest(
        "Cosmos supports at most ten atomic patch operations; use update() for larger changes"
      );
    try {
      await this.item(primaryKey).patch(operations, {
        accessCondition: { type: "IfMatch", condition: original._etag! }
      });
    } catch (error) {
      this.translateError(primaryKey, error);
    }
  }

  /**
   * Perform update.
   * @override
   */
  async update(data: any, conditionField?: any, condition?: any): Promise<void> {
    const original = await this.read(data);
    this.checkWriteCondition(data, original, conditionField, condition);
    const existing = this.fromDocument(original);
    const clazz = (data instanceof this.model ? data.constructor : existing.constructor) as T;
    const memory = new MemoryRepository(clazz, this.pks, this.separator);
    const replacement = this.document((await memory.create(data, false)) as InstanceType<T>);
    if (replacement.id !== original.id) throw new WebdaError.BadRequest("Cannot change a Cosmos primary key");
    try {
      await this.item(data).replace(replacement, { accessCondition: { type: "IfMatch", condition: original._etag! } });
    } catch (error) {
      this.translateError(data, error);
    }
  }
  /**
   * Perform patch.
   * @override
   */
  async patch(primaryKey: any, data: any, field?: any, expected?: any): Promise<void> {
    await this.mutate(primaryKey, repo => repo.patch(primaryKey, data), field, expected);
  }
  /**
   * Perform delete.
   * @override
   */
  async delete(primaryKey: any, field?: any, expected?: any): Promise<void> {
    const original = await this.read(primaryKey);
    this.checkWriteCondition(primaryKey, original, field, expected);
    try {
      await this.item(primaryKey).delete({ accessCondition: { type: "IfMatch", condition: original._etag! } });
    } catch (error) {
      this.translateError(primaryKey, error);
    }
  }
  /**
   * Perform remove attribute.
   * @override
   */
  async removeAttribute(primaryKey: any, attribute: any, field?: any, expected?: any): Promise<void> {
    await this.mutate(primaryKey, repo => repo.removeAttribute(primaryKey, attribute), field, expected);
  }
  /**
   * Perform increment attributes.
   * @override
   */
  async incrementAttributes(primaryKey: any, info: any, field?: any, expected?: any): Promise<Record<string, number>> {
    const entries: [string, number][] = Array.isArray(info)
      ? info.map(entry => (typeof entry === "string" ? [entry, 1] : [entry.property, entry.value ?? 1]))
      : Object.entries(info);
    const operations: PatchOperation[] = entries.map(([property, value]) => {
      if (
        !Number.isFinite(value) ||
        property.split(".").some(part => ["__proto__", "constructor", "prototype"].includes(part))
      )
        throw new WebdaError.BadRequest("Invalid Cosmos increment");
      return {
        op: "incr",
        path:
          "/value/" +
          property
            .split(".")
            .map(part => part.replace(/~/g, "~0").replace(/\//g, "~1"))
            .join("/"),
        value
      };
    });
    let updated: Record<string, number> = {};
    await this.mutate(
      primaryKey,
      async repo => {
        updated = (await repo.incrementAttributes(primaryKey, info)) as Record<string, number>;
      },
      field,
      expected,
      operations
    );
    return updated;
  }
  /**
   * Perform upsert item to collection.
   * @override
   */
  async upsertItemToCollection(
    primaryKey: any,
    collection: any,
    item: any,
    index?: number,
    field?: any,
    expected?: any
  ): Promise<void> {
    await this.mutate(primaryKey, repo =>
      repo.upsertItemToCollection(primaryKey, collection, item, index, field, expected)
    );
  }
  /**
   * Perform delete item from collection.
   * @override
   */
  async deleteItemFromCollection(
    primaryKey: any,
    collection: any,
    index: number,
    field?: any,
    expected?: any
  ): Promise<void> {
    await this.mutate(primaryKey, repo =>
      repo.deleteItemFromCollection(primaryKey, collection, index, field, expected)
    );
  }

  /**
   * Perform query.
   * @override
   */
  async query(
    query: string | any,
    params?: QL.QueryParameters
  ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const parsed =
      typeof query === "string" ? QL.parse(params ? QL.bind(query, params) : query) : QL.normalizeQuery(query);
    QL.assertFilterQuery(parsed);
    const types = this.acceptedTypes();
    if (types.length)
      parsed.filter = new QL.AndExpression([new QL.ComparisonExpression("IN", "__type", types), parsed.filter]);
    const result = await this.container()
      .items.query<CosmosDocument>(cosmosQuery(parsed), {
        maxItemCount: parsed.limit,
        continuationToken: parsed.continuationToken
      })
      .fetchNext();
    return {
      results: result.resources.map(document => this.fromDocument(document)),
      continuationToken: result.continuationToken
    };
  }
  /**
   * Perform iterate.
   * @override
   */
  async *iterate(query: string, params?: QL.QueryParameters): AsyncGenerator<InstanceType<T>> {
    const parsed = QL.parse(params ? QL.bind(query, params) : query);
    do {
      const page = await this.query(parsed);
      yield* page.results;
      parsed.continuationToken = page.continuationToken;
    } while (parsed.continuationToken);
  }
  /**
   * Perform delete many.
   * @override
   */
  async deleteMany(): Promise<number> {
    throw new WebdaError.NotImplemented("Cosmos bulk delete is not supported");
  }
  /**
   * Perform update many.
   * @override
   */
  async updateMany(): Promise<number> {
    throw new WebdaError.NotImplemented("Cosmos bulk update is not supported");
  }
}

/** Cosmos DB NoSQL store using optimistic ETags and atomic document patches.
 * @WebdaModda
 */
export class CosmosStore extends Store<CosmosStoreParameters> implements AzureContributor {
  static Parameters = CosmosStoreParameters;
  protected client!: CosmosClient;

  /**
   * Perform init.
   * @override
   */
  async init(): Promise<this> {
    const p = this.parameters;
    this.client = new CosmosClient({
      endpoint: p.endpoint,
      ...(p.key !== undefined ? { key: SecretString.from(p.key, "key") } : { aadCredentials: getAzureCredential(p) })
    });
    if (p.createIfNotExists) {
      await this.client.databases.createIfNotExists({ id: p.database });
      await this.client
        .database(p.database)
        .containers.createIfNotExists(
          { id: p.container, partitionKey: { paths: [p.partitionKey] } },
          { offerThroughput: p.throughput }
        );
    }
    await super.init();
    return this;
  }

  /**
   * Perform get repository.
   * @override
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const repository = new CosmosRepository(
      model,
      meta.PrimaryKey,
      () => this.client.database(this.parameters.database).container(this.parameters.container),
      this.parameters.partitionKey,
      meta.PrimaryKeySeparator
    );
    return new EventRepository(
      model,
      meta.PrimaryKey,
      repository,
      meta.PrimaryKeySeparator
    ) as unknown as Repository<T>;
  }

  /**
   * Perform stop.
   * @override
   */
  async stop(): Promise<void> {
    this.client?.dispose();
    await super.stop();
  }

  /**
   * Describe the Azure resources and identity permissions required by this service.
   * @param deployer - Deployment scope and identity helpers
   * @returns The azure resources result
   */
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution {
    const p = this.parameters,
      account = new URL(p.endpoint).hostname.split(".")[0];
    const accountId = `/subscriptions/${deployer.resources.subscriptionId}/resourceGroups/${deployer.resources.resourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${account}`;
    const databaseId = `${accountId}/sqlDatabases/${p.database}`;
    return {
      resources: [
        {
          type: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases",
          apiVersion: "2024-11-15",
          name: `${account}/${p.database}`,
          properties: { resource: { id: p.database } }
        },
        {
          type: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers",
          apiVersion: "2024-11-15",
          name: `${account}/${p.database}/${p.container}`,
          dependsOn: [databaseId],
          properties: {
            resource: { id: p.container, partitionKey: { paths: [p.partitionKey], kind: "Hash" } },
            options: p.throughput ? { throughput: p.throughput } : {}
          }
        },
        {
          type: "Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments",
          apiVersion: "2024-11-15",
          name: `[concat('${account}/', guid('${accountId}', '${p.database}/${p.container}', ${deployer.getAppPrincipalId().slice(1, -1)}))]`,
          dependsOn: [databaseId],
          properties: {
            roleDefinitionId: `${accountId}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002`,
            scope: `${databaseId}/containers/${p.container}`,
            principalId: deployer.getAppPrincipalId()
          }
        }
      ]
    };
  }
}
