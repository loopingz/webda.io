/**
 * A model as a store lays it out: where its objects go and how they are keyed
 */
export interface KeyspaceEntry {
  /** Model identifier (e.g. "Blog/Post") */
  Identifier: string;
  /** Primary key fields of the model */
  PrimaryKey: string[];
  /** Ancestors of the model, used to tell a hierarchy from unrelated models */
  Ancestors: string[];
  /** Table, collection or folder the objects are stored in, as named by the store */
  keyspace: string;
}

/**
 * Unrelated models whose keys share one keyspace
 */
export interface KeyCollision {
  /** The shared keyspace */
  keyspace: string;
  /** Root model of each family sharing it, sorted */
  models: string[];
}

/**
 * Whether a primary key is chosen by the application rather than generated
 *
 * A `uuid` key is generated: two models drawing random uuids do not collide in practice. Any other key
 * (a slug, a name, a composite) is natural, and two models can pick the same value.
 * @param primaryKey - the primary key fields
 * @returns true for a natural key
 */
function isNaturalKey(primaryKey: string[]): boolean {
  return primaryKey.length > 0 && !(primaryKey.length === 1 && primaryKey[0] === "uuid");
}

/**
 * Find the keyspaces where unrelated models with natural keys can overwrite each other
 *
 * A store keys its objects by the serialized primary key alone. A model and its subclasses share a keyspace on
 * purpose, but two unrelated models with natural keys do not see each other: a `Tag` slug equal to a `Post` slug
 * is the same storage key, so creating the second fails and reading it returns the first.
 *
 * The check only needs the model metadata and the keyspace each model is stored in, so it can run at startup,
 * once the stores are known, or from the build with the routing of a deployment.
 * @param entries - the models, with the keyspace their store puts them in
 * @returns the colliding keyspaces, sorted by name
 */
export function findKeyCollisions(entries: KeyspaceEntry[]): KeyCollision[] {
  const keyspaces = new Map<string, KeyspaceEntry[]>();
  for (const entry of entries) {
    if (!isNaturalKey(entry.PrimaryKey)) continue;
    if (!keyspaces.has(entry.keyspace)) keyspaces.set(entry.keyspace, []);
    keyspaces.get(entry.keyspace)!.push(entry);
  }

  const collisions: KeyCollision[] = [];
  for (const [keyspace, members] of keyspaces) {
    const identifiers = new Set(members.map(member => member.Identifier));
    // A family is represented by its root: the member with no ancestor in the same keyspace
    const roots = members
      .filter(member => !member.Ancestors.some(ancestor => identifiers.has(ancestor)))
      .map(member => member.Identifier)
      .sort();
    if (roots.length > 1) collisions.push({ keyspace, models: roots });
  }
  return collisions.sort((a, b) => a.keyspace.localeCompare(b.keyspace));
}
