import { AsyncLocalStorage } from "node:async_hooks";
import { type DeletePolicy, type ModelClass, type Repository, useRepository } from "@webda/models";
import { escape } from "@webda/ql";
import { NotEnumerable } from "@webda/utils";
import * as WebdaError from "../errors/errors.js";
import { useApplication } from "../application/hooks.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";

/**
 * RelationIntegrity parameters
 */
export class RelationIntegrityParameters extends ServiceParameters {
  /**
   * Apply the delete policies of the relations
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * Max cascade depth before aborting
   *
   * @default 16
   */
  maxDepth?: number;
  /**
   * Concurrent dependent deletions or updates per level
   *
   * @default 10
   */
  concurrency?: number;

  /**
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.enabled ??= true;
    this.maxDepth ??= 16;
    this.concurrency ??= 10;
    return this;
  }
}

/**
 * Kind of a relation, as compiled in `Relations`
 */
export type RelationIntegrityType = "PARENT" | "LINK" | "LINKS_MAP" | "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY";

/**
 * A relation of a model (`model.attribute`) targeting another model, with its delete policy
 */
export interface RelationDependent {
  /**
   * Model declaring the relation
   */
  model: string;
  attribute: string;
  type: RelationIntegrityType;
  onDelete: DeletePolicy;
}

/**
 * A `Contains` relation: the models listed by `attribute` belong to the declaring model
 */
export interface RelationOwned {
  attribute: string;
  /**
   * Model listed
   */
  model: string;
  type: RelationIntegrityType;
  onDelete: DeletePolicy;
}

/**
 * Cascade in progress, shared by every delete it triggers
 */
interface CascadeContext {
  /**
   * `Model#uid` already deleted or scheduled
   */
  visited: Set<string>;
  /**
   * Level of the delete in the cascade, 0 for the delete that started it
   */
  depth: number;
}

/**
 * Models listed by the `Contains` relations of an object, read before it is deleted
 */
interface PendingOwned {
  relation: RelationOwned;
  keys: string[];
}

/**
 * @param value - a link array or map, hydrated or plain
 * @returns its plain form
 */
function plainOf(value: any): any {
  return typeof value.toJSON === "function" ? value.toJSON() : value;
}

/**
 * Applies the delete policies of the relations (`DeletePolicy` of `@webda/models`)
 *
 * The policies come from the compiled `Relations` of every model: `parent` (`CASCADE` by default), `links` with an
 * `onDelete`, `Contains` links (`ownership: "CONTAINS"`) and `ModelsMapped` tagged `@CascadeDelete`. The service
 * listens to the repository events of every model a policy applies to:
 *
 * - `Delete`, before the deletion: `RESTRICT` refuses it with a `409 Conflict` while a dependent exists, and the
 *   models listed by a `Contains` are read (they are lost with the object)
 * - `Deleted`, once the object is gone: `CASCADE` deletes the dependents through their repository, so their own
 *   events fire and the cascade goes on; `SET_NULL` removes the link, or the item of a link array
 *
 * The destructive work runs after the deletion: a failure leaves orphans, that can be swept later, rather than
 * dependents deleted under an object that still exists. A relation targeting a model also applies to its subclasses.
 *
 * Limits:
 * - `Repository.deleteMany` emits no per-object event: it never cascades
 * - the cascade runs at system level, only the first delete is permission checked
 * - it is best effort and not transactional; a `RESTRICT` deeper in the cascade fails it once its root is deleted
 * - dependents through a link array or map are found by scanning the dependent model
 *
 * The `Core` declares it as `RelationIntegrity` when no service of this type is configured.
 *
 * @WebdaModda
 */
export class RelationIntegrity<T extends RelationIntegrityParameters = RelationIntegrityParameters> extends Service<T> {
  /**
   * Relations targeting each model with a policy other than `NONE`, by target identifier
   */
  @NotEnumerable
  protected dependents: Map<string, RelationDependent[]> = new Map();
  /**
   * `Contains` relations of each model with a policy other than `NONE`, by owner identifier
   */
  @NotEnumerable
  protected owned: Map<string, RelationOwned[]> = new Map();
  /**
   * Identifiers of each model and of its ancestors, nearest first
   */
  @NotEnumerable
  protected lineage: Map<string, string[]> = new Map();
  /**
   * Hooked repositories and the models whose deletes they emit
   */
  @NotEnumerable
  protected hooked: WeakMap<Repository<any>, Set<string>> = new WeakMap();
  /**
   * `Contains` keys read on `Delete`, consumed on `Deleted`
   */
  @NotEnumerable
  protected pending: Map<string, PendingOwned[]> = new Map();
  /**
   * Errors of a cascade, thrown once the object they come from is deleted
   */
  @NotEnumerable
  protected cascadeErrors: WeakSet<object> = new WeakSet();
  /**
   * Cascade in progress
   */
  @NotEnumerable
  protected cascade: AsyncLocalStorage<CascadeContext> = new AsyncLocalStorage();

  /**
   * Listen to the repositories: the stores are initialized first, their repositories are registered
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    this.hookRepositories();
    return this;
  }

  /**
   * Build the delete policies from the model metadata and listen to the repositories of the models they apply to
   *
   * Idempotent: a repository is listened to once. Call it again after replacing repositories.
   */
  hookRepositories(): void {
    if (!this.parameters.enabled) {
      return;
    }
    const models: Record<string, ModelClass> = useApplication().getModels() as any;
    this.buildIndex(models);
    for (const [identifier, model] of Object.entries(models)) {
      if (!model || (!this.dependentsOf(identifier).length && !this.ownedOf(identifier).length)) {
        continue;
      }
      let repository: Repository<any>;
      try {
        repository = useRepository(model);
      } catch (err) {
        // A model without a store (no primary key): nothing emits its deletes
        this.log("TRACE", `No repository for ${identifier}: its delete policies are not applied`, err);
        continue;
      }
      const hooked = this.hooked.get(repository);
      if (hooked) {
        hooked.add(identifier);
        continue;
      }
      const identifiers = new Set([identifier]);
      this.hooked.set(repository, identifiers);
      repository.on("Delete", (evt: any) => this.beforeDelete(identifiers, repository, evt.object_id));
      repository.on("Deleted", (evt: any) => this.afterDelete(identifiers, repository, evt.object_id));
    }
  }

  /**
   * Reverse index of the relations
   * @param models - the application models
   */
  protected buildIndex(models: Record<string, ModelClass>): void {
    const dependents = new Map<string, Map<string, RelationDependent>>();
    const owned = new Map<string, RelationOwned[]>();
    const lineage = new Map<string, string[]>();
    const add = (target: string | undefined, dependent: RelationDependent) => {
      if (!target || dependent.onDelete === "NONE") return;
      if (!dependents.has(target)) dependents.set(target, new Map());
      dependents.get(target)!.set(`${dependent.model}\0${dependent.attribute}`, dependent);
    };
    for (const [identifier, model] of Object.entries(models)) {
      // An entry of the application models can be undefined (a failed import)
      if (!model) continue;
      const metadata: any = (model as any).Metadata;
      lineage.set(identifier, [
        identifier,
        ...metadata.Ancestors.map((ancestor: any) =>
          typeof ancestor === "string" ? ancestor : ancestor.Metadata.Identifier
        )
      ]);
      const relations = metadata.Relations;
      if (relations.parent) {
        add(relations.parent.model, {
          model: identifier,
          attribute: relations.parent.attribute,
          type: "PARENT",
          onDelete: relations.parent.onDelete ?? "CASCADE"
        });
      }
      for (const link of relations.links ?? []) {
        if (link.ownership === "CONTAINS") {
          // The policy of a Contains is always recorded
          if (link.model && link.onDelete !== "NONE") {
            if (!owned.has(identifier)) owned.set(identifier, []);
            owned.get(identifier)!.push({ ...link, model: link.model, onDelete: link.onDelete });
          }
          continue;
        }
        if (link.onDelete) {
          add(link.model, { model: identifier, attribute: link.attribute, type: link.type, onDelete: link.onDelete });
        }
      }
    }
    // ModelsMapped tagged @CascadeDelete: deleting the owner deletes the mapped models linking to it
    for (const [identifier, model] of Object.entries(models)) {
      for (const map of (model as any)?.Metadata.Relations.maps ?? []) {
        if (!map.cascadeDelete || !map.model) continue;
        const mapped = (models[map.model] as any)?.Metadata?.Relations ?? {};
        const type: RelationIntegrityType =
          mapped.parent?.attribute === map.targetLink
            ? "PARENT"
            : (mapped.links?.find((link: any) => link.attribute === map.targetLink)?.type ?? "LINK");
        add(identifier, { model: map.model, attribute: map.targetLink, type, onDelete: "CASCADE" });
      }
    }
    this.dependents = new Map([...dependents.entries()].map(([target, list]) => [target, [...list.values()]]));
    this.owned = owned;
    this.lineage = lineage;
  }

  /**
   * Relations targeting a model or one of its ancestors
   * @param identifier - the model
   * @returns the dependents
   */
  dependentsOf(identifier: string): RelationDependent[] {
    const result = new Map<string, RelationDependent>();
    for (const model of this.lineage.get(identifier) ?? [identifier]) {
      for (const dependent of this.dependents.get(model) ?? []) {
        result.set(`${dependent.model}\0${dependent.attribute}`, dependent);
      }
    }
    return [...result.values()];
  }

  /**
   * `Contains` relations of a model
   * @param identifier - the model
   * @returns the owned relations
   */
  ownedOf(identifier: string): RelationOwned[] {
    return this.owned.get(identifier) ?? [];
  }

  /**
   * @param identifiers - models of a repository
   * @returns their dependents
   */
  protected dependentsOfAll(identifiers: Set<string>): RelationDependent[] {
    const result = new Map<string, RelationDependent>();
    for (const identifier of identifiers) {
      for (const dependent of this.dependentsOf(identifier)) {
        result.set(`${dependent.model}\0${dependent.attribute}`, dependent);
      }
    }
    return [...result.values()];
  }

  /**
   * @param identifiers - models of a repository
   * @returns their `Contains` relations
   */
  protected ownedOfAll(identifiers: Set<string>): RelationOwned[] {
    return [...identifiers].flatMap(identifier => this.ownedOf(identifier));
  }

  /**
   * @param repository - a repository
   * @param key - a primary key
   * @returns its string form
   */
  protected uidOf(repository: Repository<any>, key: any): string {
    return repository.getUID(key);
  }

  /**
   * @param identifiers - models of a repository
   * @param uid - an object uid
   * @returns the key of the pending `Contains` keys
   */
  protected pendingKey(identifiers: Set<string>, uid: string): string {
    return `${[...identifiers].join(",")}#${uid}`;
  }

  /**
   * Before the deletion: enforce `RESTRICT`, read the models listed by `Contains`
   * @param identifiers - models of the repository
   * @param repository - the repository
   * @param objectId - the deleted primary key
   */
  protected async beforeDelete(identifiers: Set<string>, repository: Repository<any>, objectId: any): Promise<void> {
    const context = this.cascade.getStore();
    const name = [...identifiers][0];
    const uid = this.uidOf(repository, objectId);
    // Left by a previous delete of the same object that failed in the store
    this.pending.delete(this.pendingKey(identifiers, uid));
    if (context && context.depth > this.parameters.maxDepth) {
      throw new WebdaError.CodeError(
        "CASCADE_TOO_DEEP",
        `Cascade delete of ${name} ${uid} exceeds maxDepth (${this.parameters.maxDepth})`
      );
    }
    for (const dependent of this.dependentsOfAll(identifiers)) {
      if (dependent.onDelete !== "RESTRICT") continue;
      const found = await this.findDependents(dependent, uid, 1);
      if (found.length) {
        throw new WebdaError.Conflict(
          `Cannot delete ${name} ${uid}: ${dependent.model}.${dependent.attribute} still references it`
        );
      }
    }
    const owned = this.ownedOfAll(identifiers);
    if (!owned.length) return;
    // Not found: nothing listed
    const object: any = await repository.get(objectId).catch(() => undefined);
    if (!object) return;
    const pending: PendingOwned[] = [];
    for (const relation of owned) {
      const keys = this.keysOf(relation.model, object[relation.attribute], relation.type);
      if (relation.onDelete === "RESTRICT") {
        const repo = this.repositoryOf(relation.model);
        for (const key of keys) {
          if (repo && (await repo.exists(key))) {
            throw new WebdaError.Conflict(
              `Cannot delete ${name} ${uid}: ${name}.${relation.attribute} still lists ${relation.model} ${key}`
            );
          }
        }
      } else if (keys.length) {
        pending.push({ relation, keys });
      }
    }
    if (pending.length) {
      this.pending.set(this.pendingKey(identifiers, uid), pending);
    }
  }

  /**
   * After the deletion: apply `CASCADE` and `SET_NULL`
   * @param identifiers - models of the repository
   * @param repository - the repository
   * @param objectId - the deleted primary key
   */
  protected async afterDelete(identifiers: Set<string>, repository: Repository<any>, objectId: any): Promise<void> {
    const uid = this.uidOf(repository, objectId);
    const pendingKey = this.pendingKey(identifiers, uid);
    const pending = this.pending.get(pendingKey) ?? [];
    this.pending.delete(pendingKey);
    const parent = this.cascade.getStore();
    const context: CascadeContext = { visited: parent?.visited ?? new Set(), depth: (parent?.depth ?? 0) + 1 };
    for (const identifier of identifiers) {
      context.visited.add(`${identifier}#${uid}`);
    }
    const errors: any[] = [];
    await this.cascade.run(context, async () => {
      for (const dependent of this.dependentsOfAll(identifiers)) {
        if (dependent.onDelete !== "CASCADE" && dependent.onDelete !== "SET_NULL") continue;
        try {
          const found = await this.findDependents(dependent, uid);
          if (dependent.onDelete === "CASCADE") {
            await this.deleteAll(found, context, errors);
          } else {
            await this.runBounded(found, object => this.unlink(object, dependent, uid), errors);
          }
        } catch (err) {
          errors.push(err);
        }
      }
      for (const { relation, keys } of pending) {
        const repo = this.repositoryOf(relation.model);
        if (!repo) continue;
        const objects: any[] = [];
        for (const key of keys) {
          // Already gone: not listed
          const object = await repo.get(key).catch(() => undefined);
          if (object) objects.push(object);
        }
        await this.deleteAll(objects, context, errors);
      }
    });
    if (!errors.length) return;
    for (const err of errors) {
      this.log("WARN", `Cascade delete of ${[...identifiers][0]} ${uid} left dependents behind`, err);
    }
    const error =
      errors.length === 1
        ? errors[0]
        : new AggregateError(errors, `Cascade delete of ${[...identifiers][0]} ${uid} failed ${errors.length} times`);
    this.cascadeErrors.add(error);
    throw error;
  }

  /**
   * @param identifier - a model
   * @returns its repository, undefined when it has none
   */
  protected repositoryOf(identifier: string): Repository<any> | undefined {
    try {
      return useRepository(useApplication().getModel(identifier) as any);
    } catch {
      // Unknown model, or a model without a store
      return undefined;
    }
  }

  /**
   * Keys listed by a link array or map
   * @param identifier - the listed model
   * @param value - the attribute value
   * @param type - the relation type
   * @returns the uids
   */
  protected keysOf(identifier: string, value: any, type: RelationIntegrityType): string[] {
    if (value === undefined || value === null) return [];
    if (type === "LINKS_MAP") return Object.keys(plainOf(value));
    return Array.from(value as Iterable<any>, item => this.keyOf(identifier, item)).filter(key => key !== undefined);
  }

  /**
   * @param identifier - the linked model
   * @param item - a link: a key, a reference or an object holding the key
   * @returns its uid
   */
  protected keyOf(identifier: string, item: any): string | undefined {
    if (typeof item === "string" || typeof item === "number") return String(item);
    try {
      return this.repositoryOf(identifier)?.getUID(
        typeof item?.getPrimaryKey === "function" ? item.getPrimaryKey() : item
      );
    } catch {
      // Not a key of the model
      return undefined;
    }
  }

  /**
   * Find the objects whose relation targets a deleted object
   *
   * A single link is queried (`attribute = uid`); a link array or map is checked on every object of the model.
   * @param dependent - the relation
   * @param uid - the deleted object uid
   * @param limit - stop after this many objects
   * @returns the dependent objects
   */
  protected async findDependents(dependent: RelationDependent, uid: string, limit?: number): Promise<any[]> {
    const repository = this.repositoryOf(dependent.model);
    if (!repository) return [];
    const single = dependent.type === "LINK" || dependent.type === "PARENT";
    const query = single ? escape([`${dependent.attribute} = `, limit ? ` LIMIT ${limit}` : ""], [uid]) : "";
    const result: any[] = [];
    for await (const object of repository.iterate(query as any)) {
      if (!single && !this.keysOf(dependent.model, object?.[dependent.attribute], dependent.type).includes(uid)) {
        continue;
      }
      result.push(object);
      if (limit && result.length >= limit) break;
    }
    return result;
  }

  /**
   * @param object - an object
   * @returns its model identifier and repository
   */
  protected modelOf(object: any): { identifier: string; repository: Repository<any> } {
    const clazz = object.constructor;
    return { identifier: clazz.Metadata.Identifier, repository: useRepository(clazz) };
  }

  /**
   * Delete objects of the cascade, each once, through their own repository so their events fire
   * @param objects - the objects
   * @param context - the cascade
   * @param errors - the errors collected
   */
  protected async deleteAll(objects: any[], context: CascadeContext, errors: any[]): Promise<void> {
    const scheduled = objects.filter(object => {
      const { identifier, repository } = this.modelOf(object);
      const key = `${identifier}#${this.uidOf(repository, repository.getPrimaryKey(object))}`;
      if (context.visited.has(key)) return false;
      context.visited.add(key);
      return true;
    });
    await this.runBounded(
      scheduled,
      async object => {
        const { repository } = this.modelOf(object);
        const key = repository.getPrimaryKey(object);
        try {
          await repository.delete(key);
        } catch (err: any) {
          // The object is deleted but its own cascade failed
          if (this.cascadeErrors.has(err)) throw err;
          // Deleted meanwhile: not a failure
          if (!(await repository.exists(key))) return;
          throw err;
        }
      },
      errors
    );
  }

  /**
   * `SET_NULL`: remove the link to a deleted object
   * @param object - the dependent object
   * @param dependent - the relation
   * @param uid - the deleted object uid
   */
  protected async unlink(object: any, dependent: RelationDependent, uid: string): Promise<void> {
    const { repository } = this.modelOf(object);
    const key = repository.getPrimaryKey(object);
    const attribute: any = dependent.attribute;
    if (dependent.type === "LINK" || dependent.type === "PARENT") {
      await repository.removeAttribute(key, attribute);
      return;
    }
    const value = object[dependent.attribute];
    if (dependent.type === "LINKS_MAP") {
      const map = { ...plainOf(value) };
      delete map[uid];
      await repository.patch(key, { [dependent.attribute]: map } as any);
      return;
    }
    const keys = this.keysOf(dependent.model, value, dependent.type);
    // From the end: the remaining indexes do not move
    for (let index = keys.length - 1; index >= 0; index--) {
      if (keys[index] === uid) {
        await (repository as any).deleteItemFromCollection(key, attribute, index);
      }
    }
  }

  /**
   * Run a task on each item, `concurrency` at a time, collecting the errors
   * @param items - the items
   * @param task - the task
   * @param errors - the errors collected
   */
  protected async runBounded<I>(items: I[], task: (item: I) => Promise<void>, errors: any[]): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const item = items[next++];
        try {
          await task(item);
        } catch (err) {
          errors.push(err);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.parameters.concurrency, items.length) }, worker));
  }
}
