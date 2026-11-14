import { stringifyHydrate, type HydrateMode, type QueryValidator } from "@webda/ql";
import { runWithContext } from "../contexts/execution.js";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { useModel } from "../application/hooks.js";
import { useModelMetadata } from "../core/hooks.js";
import { primaryKeyFields, subclassesOf, visibleFields } from "./modelfields.js";

/**
 * Deepest HYDRATE path of a client query by default (`project.team` has a depth of two)
 */
export const DEFAULT_HYDRATE_MAX_DEPTH = 2;
/**
 * Deepest HYDRATE path that can be configured
 */
export const MAX_HYDRATE_DEPTH = 5;
/**
 * Most distinct related objects one client query loads by default
 */
export const DEFAULT_HYDRATE_MAX_OBJECTS = 1000;
/**
 * Context extension a transport sets to refuse HYDRATE in the Query operations it dispatches: its value is the
 * message of the 400 (gRPC messages type a relation as its key, a hydrated object does not fit them)
 */
export const QUERY_HYDRATE_REFUSED = "queryHydrateRefused";

/**
 * How a client query hydrates relations
 */
export type HydrateOptions = {
  /**
   * Deepest path accepted, {@link DEFAULT_HYDRATE_MAX_DEPTH} by default, at most {@link MAX_HYDRATE_DEPTH}
   */
  maxDepth?: number;
  /**
   * Most distinct related objects loaded by the query, {@link DEFAULT_HYDRATE_MAX_OBJECTS} by default
   */
  maxObjects?: number;
  /**
   * Refuse a HYDRATE clause with this message: for the transports whose results cannot hold a hydrated object
   */
  refused?: string;
  /**
   * Operation-level gate of one related object, asked before it is read: whether the caller could `GET` it (operation
   * enabled, operation permission, token scopes, authorizers). The model's `canAct("get")` is asked after it, always
   */
  canGet?: (model: any, key: any) => boolean | Promise<boolean>;
};

/**
 * Kind of a relation that can be hydrated: the parent, or one of the link types
 */
type RelationKind = "PARENT" | "LINK" | "LINKS_SIMPLE_ARRAY" | "LINKS_ARRAY" | "LINKS_MAP";

/**
 * The link types of `Metadata.Relations.links` that can be hydrated
 */
const LINK_KINDS: ReadonlySet<string> = new Set(["LINK", "LINKS_SIMPLE_ARRAY", "LINKS_ARRAY", "LINKS_MAP"]);

/**
 * A relation of one model class
 */
type RelationTarget = {
  /**
   * The class holding the relation
   */
  owner: any;
  /**
   * Kind of the relation
   */
  kind: RelationKind;
  /**
   * The related model class
   */
  model: any;
};

/**
 * One relation of a HYDRATE clause, resolved against the model metadata
 */
export type HydrateNode = {
  /**
   * Attribute holding the relation
   */
  attribute: string;
  /**
   * Join mode: `LEFT` for a parent path implied by a child path
   */
  mode: HydrateMode;
  /**
   * The relation in each class it can be read from (the model the path reaches, and its subclasses)
   */
  targets: RelationTarget[];
  /**
   * Relations of the related objects to hydrate
   */
  children: HydrateNode[];
};

/**
 * A checked HYDRATE clause
 */
export type HydratePlan = {
  /**
   * Relations of the queried model to hydrate
   */
  nodes: HydrateNode[];
  /**
   * Whether a path is INNER: results can then be dropped
   */
  inner: boolean;
  /**
   * The clause in its canonical form, bound to the continuation token
   */
  clause: string;
};

/**
 * Whether a value is an object with fields (not an array)
 * @param value - the value
 * @returns true for a record
 */
function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The hydratable relation an attribute of a model class holds, from its metadata: the parent or a link. Reverse
 * relations (`queries`), maps, polymorphic links, binaries and behaviors are not: attributes are only compared, never
 * read by name
 * @param owner - the model class
 * @param attribute - the attribute name
 * @returns the kind and the identifier of the related model, undefined when the attribute is not such a relation
 */
function relationOf(owner: any, attribute: string): { kind: RelationKind; model: string } | undefined {
  let relations: any;
  try {
    relations = useModelMetadata(owner)?.Relations;
  } catch {
    // A class registered without metadata
  }
  if (relations?.parent?.attribute === attribute) {
    return { kind: "PARENT", model: relations.parent.model };
  }
  const link = (Array.isArray(relations?.links) ? relations.links : []).find((l: any) => l?.attribute === attribute);
  return link && LINK_KINDS.has(link.type) ? { kind: link.type, model: link.model } : undefined;
}

/**
 * The relation an attribute holds in each of some classes
 * @param classes - the model classes
 * @param attribute - the attribute name
 * @returns the relations found, with their related model class
 */
function relationTargets(classes: any[], attribute: string): RelationTarget[] {
  const targets: RelationTarget[] = [];
  for (const owner of classes) {
    const relation = relationOf(owner, attribute);
    if (!relation) {
      continue;
    }
    let model: any;
    try {
      model = useModel(relation.model);
    } catch {
      // Unknown related model
    }
    if (typeof model === "function") {
      targets.push({ owner, kind: relation.kind, model });
    }
  }
  return targets;
}

/**
 * The classes of the objects a relation can return: the related models and their subclasses
 * @param targets - the relation in each class it can be read from
 * @returns the classes, once each
 */
function targetClasses(targets: RelationTarget[]): any[] {
  const classes = new Set<any>();
  for (const { model } of targets) {
    classes.add(model);
    subclassesOf(model).forEach(sub => classes.add(sub));
  }
  return [...classes];
}

/**
 * Check the HYDRATE clause of a client query against the relations of the queried model
 *
 * Each path is resolved segment by segment, from the queried model and its subclasses (a query returns their rows):
 * a segment must be the parent or a link attribute of the model it is read from, and the next one applies to the
 * related model. A child path implies its parents, in LEFT mode unless they are listed.
 *
 * Decided from the metadata only, before any store read; an error names the requested path only.
 * @param model - the queried model class
 * @param query - the parsed client query
 * @param options - the limits, and whether the transport refuses HYDRATE
 * @returns the relations to hydrate, undefined without a HYDRATE clause
 * @throws WebdaError.BadRequest when HYDRATE is refused, for a path listed twice, a path deeper than
 * `options.maxDepth`, or a path that is not a chain of parent and link relations
 */
export function planHydration(model: any, query: QueryValidator, options?: HydrateOptions): HydratePlan | undefined {
  const items = query.getQuery().hydrate;
  if (items === undefined) {
    return undefined;
  }
  if (options?.refused) {
    throw new WebdaError.BadRequest(options.refused);
  }
  const maxDepth = Math.min(Math.max(Math.trunc(options?.maxDepth ?? DEFAULT_HYDRATE_MAX_DEPTH), 1), MAX_HYDRATE_DEPTH);
  const listed = new Set<string>();
  for (const { path } of items) {
    if (listed.has(path)) {
      throw new WebdaError.BadRequest(`HYDRATE lists "${path}" more than once`);
    }
    listed.add(path);
    if (path.split(".").length > maxDepth) {
      throw new WebdaError.BadRequest(`HYDRATE "${path}" is deeper than ${maxDepth}`);
    }
  }
  const nodes: HydrateNode[] = [];
  for (const { path, mode } of items) {
    let level = nodes;
    let classes = [model, ...subclassesOf(model)];
    const segments = path.split(".");
    for (let i = 0; i < segments.length; i++) {
      let node = level.find(n => n.attribute === segments[i]);
      if (!node) {
        const targets = relationTargets(classes, segments[i]);
        if (!targets.length) {
          throw new WebdaError.BadRequest(`Cannot hydrate "${path}"`);
        }
        node = { attribute: segments[i], mode: "LEFT", targets, children: [] };
        level.push(node);
      }
      if (i === segments.length - 1) {
        node.mode = mode;
      }
      level = node.children;
      classes = targetClasses(node.targets);
    }
  }
  return { nodes, inner: items.some(item => item.mode === "INNER"), clause: stringifyHydrate(items) };
}

/**
 * Whether a selected path (`SELECT owner.name`) can be read through the relations it crosses
 *
 * - through a hydrated relation, the next segment must be a field a client can see of the related model (its Output
 *   schema and those of its subclasses, plus its primary key), when that model has Output schema metadata;
 * - through a relation that is not hydrated and holds a single-field key (parent, link, array of keys), there is no
 *   sub-field: `owner.name` needs `HYDRATE owner`.
 *
 * Links carrying data (arrays and maps of link objects) are not checked: not hydrated, they hold their link data;
 * hydrated, an array entry holds the link data with the object, and the next segment of a map is a map key. The
 * first segment is checked by the caller.
 * @param classes - the classes the path is read from
 * @param nodes - the hydrated relations of these classes
 * @param segments - the path segments
 * @returns false when the path cannot hold a value
 */
export function isSelectablePath(classes: any[], nodes: HydrateNode[], segments: string[]): boolean {
  if (segments.length < 2) {
    return true;
  }
  const node = nodes.find(n => n.attribute === segments[0]);
  if (!node) {
    return !relationTargets(classes, segments[0]).some(
      target =>
        (target.kind === "PARENT" || target.kind === "LINK" || target.kind === "LINKS_SIMPLE_ARRAY") &&
        primaryKeyFields(target.model).length === 1
    );
  }
  if (node.targets.some(target => target.kind === "LINKS_MAP")) {
    return true;
  }
  const visible = node.targets.map(target => visibleFields(target.model));
  if (
    // A hydrated link object also holds its link data, which no schema lists
    !node.targets.some(target => target.kind === "LINKS_ARRAY") &&
    visible.every(fields => fields !== undefined) &&
    !visible.some(fields => fields.has(segments[1]))
  ) {
    return false;
  }
  return isSelectablePath(targetClasses(node.targets), node.children, segments.slice(1));
}

/**
 * The primary key paths a field list keeps inside the hydrated objects it goes through: `owner.name` with
 * `HYDRATE owner` keeps `owner.uuid` too
 * @param plan - the hydrated relations
 * @param fields - the selected paths
 * @returns the primary key paths to select with them
 */
export function hydratedKeyPaths(plan: HydratePlan, fields: string[]): string[] {
  const paths = new Set<string>();
  for (const field of fields) {
    const segments = field.split(".");
    let nodes = plan.nodes;
    let prefix = "";
    for (let i = 0; i + 1 < segments.length; i++) {
      const node = nodes.find(n => n.attribute === segments[i]);
      if (!node || node.targets.some(target => target.kind === "LINKS_MAP")) {
        break;
      }
      prefix += `${segments[i]}.`;
      for (const target of node.targets) {
        primaryKeyFields(target.model).forEach(key => paths.add(`${prefix}${key}`));
      }
      nodes = node.children;
    }
  }
  return [...paths];
}

/**
 * The public form of an object, as the current caller: its `toDTO()`, or the object itself when it has none
 * @param object - a model instance or a plain object
 * @returns the public form
 */
function publicForm(object: any): any {
  return typeof object?.toDTO === "function" ? object.toDTO() : object;
}

/**
 * A scalar that can be a primary key value
 * @param value - the value
 * @returns the value, undefined when it is not a non-empty string or a number
 */
function scalarKey(value: any): string | number | undefined {
  return (typeof value === "string" && value !== "") || typeof value === "number" ? value : undefined;
}

/**
 * The primary key held by a link object (`{ uuid, role }`) or a composite key
 * @param value - the object
 * @param fields - the primary key fields of the related model
 * @returns the key, undefined when a key field is missing
 */
function objectKey(value: Record<string, any>, fields: string[]): any {
  const parts = fields.map(field => (Object.hasOwn(value, field) ? scalarKey(value[field]) : undefined));
  if (parts.some(part => part === undefined)) {
    return undefined;
  }
  return fields.length === 1 ? parts[0] : Object.fromEntries(fields.map((field, i) => [field, parts[i]]));
}

/**
 * The primary key a relation value names
 * @param value - a key, a composite key or a link object
 * @param fields - the primary key fields of the related model
 * @returns the key, undefined when the value names none
 */
function keyOf(value: any, fields: string[]): any {
  return isRecord(value) ? objectKey(value, fields) : scalarKey(value);
}

/**
 * One related object named by a relation value
 */
type Entry = {
  /**
   * Its primary key, undefined when the value names none
   */
  key: any;
  /**
   * The link data stored with the key (arrays and maps of link objects)
   */
  data?: Record<string, any>;
  /**
   * The map key of a `LINKS_MAP` entry
   */
  slot?: string;
  /**
   * The hydrated object, when it was read
   */
  child?: Item;
};

/**
 * An object being hydrated
 */
type Item = {
  /**
   * The model instance, to find its relations
   */
  instance: any;
  /**
   * Its public form, whose relations are replaced
   */
  dto: any;
  /**
   * Refused by an INNER relation
   */
  failed: boolean;
};

/**
 * The related objects a relation value names, in its shape
 * @param target - the relation
 * @param value - the relation value of the public form
 * @returns one entry per related object, undefined when the value does not have the shape of the relation
 */
function entriesOf(target: RelationTarget, value: any): Entry[] | undefined {
  const fields = primaryKeyFields(target.model);
  switch (target.kind) {
    case "LINKS_SIMPLE_ARRAY":
      return Array.isArray(value) ? value.map(item => ({ key: keyOf(item, fields) })) : undefined;
    case "LINKS_ARRAY":
      return Array.isArray(value)
        ? value.map(item => ({ key: keyOf(item, fields), ...(isRecord(item) ? { data: item } : {}) }))
        : undefined;
    case "LINKS_MAP":
      return isRecord(value)
        ? Object.entries(value).map(([slot, data]) => ({ slot, key: slot, ...(isRecord(data) ? { data } : {}) }))
        : undefined;
    default:
      return [{ key: keyOf(value, fields) }];
  }
}

/**
 * The relation of a node that applies to an object: the one of its class, or of the closest class it extends
 * @param node - the relation to hydrate
 * @param instance - the object
 * @returns the relation, undefined when the class of the object does not hold it
 */
function targetOf(node: HydrateNode, instance: any): RelationTarget | undefined {
  const own = instance?.constructor;
  return (
    node.targets.find(target => target.owner === own) ??
    node.targets.find(target => typeof target.owner === "function" && instance instanceof target.owner) ??
    (own === Object || own === undefined ? node.targets[0] : undefined)
  );
}

/**
 * Replaces the relations of query results by the related objects, for one client query
 *
 * Related objects are loaded level by level (every `owner`, then every `project`, then every `project.team`), each
 * (model, key) once for the whole query: the same object can appear in several results. An object is read as the
 * caller, and its public form (`toDTO()`, as the caller) is what replaces the key:
 *
 * - parent and `LINK`: the key becomes the object, or `null`;
 * - `LINKS_SIMPLE_ARRAY`: each key becomes the object or `null`, positions are kept;
 * - `LINKS_ARRAY` and `LINKS_MAP`: each entry becomes the object merged over the link data of the entry (the fields
 *   of the object win), or `null`; positions and map keys are kept.
 *
 * A missing object and an object the caller may not read both give `null`. With an INNER relation the result is
 * dropped instead: for a single relation when the value is unset, missing or unreadable; for a collection, the
 * `null` entries are removed and the result is dropped when no entry is left. On a nested path, an object refused by
 * its own INNER relation counts as missing for the relation holding it.
 *
 * The relation keys are read from the public form of each object: a relation its `toDTO()` hides from the caller is
 * not hydrated.
 */
export class Hydrator {
  /**
   * The objects read so far, per model class then per key: `null` for a missing or unreadable one
   */
  protected cache = new Map<any, Map<string, Promise<{ instance: any; dto: any } | null>>>();
  /**
   * Distinct objects asked so far
   */
  protected loaded = 0;

  /**
   * Create the hydrator of one client query
   * @param plan - the relations to hydrate
   * @param context - the caller context
   * @param read - reads a related object as the caller: the object, undefined when it is missing or unreadable
   * @param maxObjects - most distinct related objects to load
   */
  constructor(
    protected plan: HydratePlan,
    protected context: IOperationContext,
    protected read: (model: any, key: any) => Promise<any>,
    protected maxObjects: number = DEFAULT_HYDRATE_MAX_OBJECTS
  ) {}

  /**
   * Hydrate the relations of some results
   * @param rows - the results the caller may read
   * @returns their public form with the relations replaced, in the same order, without the results an INNER relation
   * refuses
   * @throws WebdaError.BadRequest when the query loads more than `maxObjects` distinct objects
   */
  async hydrate(rows: any[]): Promise<any[]> {
    const items: Item[] = runWithContext(this.context as any, () =>
      rows.map(row => {
        const dto = publicForm(row);
        return { instance: row, dto: isRecord(dto) ? { ...dto } : dto, failed: false };
      })
    );
    await this.level(items, this.plan.nodes);
    return items.filter(item => !item.failed).map(item => item.dto);
  }

  /**
   * Hydrate some relations of objects of the same level, then the relations of the objects they hold
   * @param items - the objects
   * @param nodes - their relations to hydrate
   */
  protected async level(items: Item[], nodes: HydrateNode[]): Promise<void> {
    for (const node of nodes) {
      const pending: { item: Item; target: RelationTarget; entries: Entry[] }[] = [];
      for (const item of items) {
        if (item.failed) {
          continue;
        }
        const target = targetOf(node, item.instance);
        const value = isRecord(item.dto) && Object.hasOwn(item.dto, node.attribute) ? item.dto[node.attribute] : null;
        const entries = target && value !== undefined && value !== null ? entriesOf(target, value) : undefined;
        if (entries) {
          pending.push({ item, target, entries });
        } else if (node.mode === "INNER") {
          // Unset: there is nothing to join
          item.failed = true;
        }
      }
      const children: Item[] = [];
      await Promise.all(
        pending.flatMap(({ target, entries }) =>
          entries.map(async entry => {
            const loaded = entry.key === undefined ? null : await this.load(target.model, entry.key);
            if (loaded) {
              // The fields of the object win over the link data stored with its key
              entry.child = { instance: loaded.instance, dto: { ...entry.data, ...loaded.dto }, failed: false };
            }
          })
        )
      );
      // In the order of the results, not of the answers
      pending.forEach(({ entries }) => entries.forEach(entry => entry.child && children.push(entry.child)));
      if (node.children.length && children.length) {
        await this.level(children, node.children);
      }
      for (const { item, target, entries } of pending) {
        this.assign(item, node, target, entries);
      }
    }
  }

  /**
   * Replace a relation of an object by its hydrated value, in the shape of the relation
   * @param item - the object
   * @param node - the relation to hydrate
   * @param target - the relation of the class of the object
   * @param entries - the related objects it names
   */
  protected assign(item: Item, node: HydrateNode, target: RelationTarget, entries: Entry[]): void {
    const inner = node.mode === "INNER";
    // An object refused by its own INNER relation counts as missing
    let values: { slot?: string; value: any }[] = entries.map(entry => ({
      slot: entry.slot,
      value: entry.child && !entry.child.failed ? entry.child.dto : null
    }));
    if (inner) {
      values = values.filter(({ value }) => value !== null);
      if (!values.length) {
        item.failed = true;
        return;
      }
    }
    if (target.kind === "LINKS_MAP") {
      // Own properties only, whatever the map keys are
      item.dto[node.attribute] = Object.fromEntries(values.map(({ slot, value }) => [slot, value]));
    } else if (target.kind === "LINKS_ARRAY" || target.kind === "LINKS_SIMPLE_ARRAY") {
      item.dto[node.attribute] = values.map(({ value }) => value);
    } else {
      item.dto[node.attribute] = values[0].value;
    }
  }

  /**
   * Read a related object as the caller, once per query
   * @param model - the related model class
   * @param key - its primary key
   * @returns the object and its public form, `null` when it is missing or unreadable
   * @throws WebdaError.BadRequest when the query loads more than `maxObjects` distinct objects
   */
  protected async load(model: any, key: any): Promise<{ instance: any; dto: any } | null> {
    let objects = this.cache.get(model);
    if (!objects) {
      objects = new Map();
      this.cache.set(model, objects);
    }
    const id = JSON.stringify(isRecord(key) ? Object.values(key).map(String) : [String(key)]);
    let loading = objects.get(id);
    if (!loading) {
      if (++this.loaded > this.maxObjects) {
        throw new WebdaError.BadRequest(
          `HYDRATE loads more than ${this.maxObjects} objects: lower LIMIT or HYDRATE fewer relations`
        );
      }
      loading = this.read(model, key).then(instance => {
        const dto = instance ? runWithContext(this.context as any, () => publicForm(instance)) : undefined;
        return isRecord(dto) ? { instance, dto } : null;
      });
      objects.set(id, loading);
    }
    return loading;
  }
}
