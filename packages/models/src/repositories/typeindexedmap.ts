/** Bucket of the entries whose stored value cannot be read: kept by every model so their error surfaces */
const UNREADABLE = Symbol("unreadable");
/** Bucket of the entries without a stored `__type` */
const UNTYPED = Symbol("untyped");

/** Bucket identifier: the stored `__type`, or one of the two markers */
type Bucket = string | typeof UNTYPED | typeof UNREADABLE;

/** Keys of one bucket */
type BucketKeys = {
  keys: Set<string>;
  /** Highest insertion sequence added to the bucket */
  last: number;
  /** False when a key joined the bucket out of storage order (a retyped entry) */
  ordered: boolean;
};

/**
 * Storage map of a MemoryRepository indexing its entries by stored `__type`
 *
 * Every model of a MemoryStore shares one storage map: without an index, a query parses every document of the
 * store to find the ones of its model. This map keeps, for each stored `__type`, the keys holding it, so
 * `MemoryRepository.query` only visits the entries of its model and subclasses.
 *
 * The index is lazy: a write only records the key, its `__type` is read (one `JSON.parse`) the first time a query
 * needs it. Every write path goes through `set` / `delete` / `clear` — repositories, persistence reload, raw
 * patches of migrations — so the index can never miss an entry.
 *
 * {@link keysOfTypes} returns the keys in the map insertion order, as iterating the map does: query results and
 * offset continuation tokens are unchanged.
 */
export class TypeIndexedMap<V = string> extends Map<string, V> {
  /** Insertion sequence of each key: the map order, to merge buckets */
  private sequence: Map<string, number>;
  /** Next insertion sequence */
  private nextSequence: number;
  /** Bucket of each indexed key */
  private bucketOf: Map<string, Bucket>;
  /** Keys of each bucket */
  private buckets: Map<Bucket, BucketKeys>;
  /** Keys written since the last indexing */
  private pending: Set<string>;

  /**
   * @param entries - initial entries
   */
  constructor(entries?: Iterable<readonly [string, V]> | null) {
    super();
    this.reset();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  /**
   * Empty the index
   */
  private reset() {
    this.sequence = new Map();
    this.nextSequence = 0;
    this.bucketOf = new Map();
    this.buckets = new Map();
    this.pending = new Set();
  }

  /**
   * Set an entry: its type is indexed on the next read
   * @param key - the key
   * @param value - the stored value
   * @returns this
   */
  set(key: string, value: V): this {
    if (!super.has(key)) {
      this.sequence.set(key, this.nextSequence++);
    }
    super.set(key, value);
    this.pending.add(key);
    return this;
  }

  /**
   * Delete an entry
   * @param key - the key
   * @returns true when the entry existed
   */
  delete(key: string): boolean {
    this.sequence.delete(key);
    this.pending.delete(key);
    this.unindex(key);
    return super.delete(key);
  }

  /**
   * Delete every entry
   */
  clear(): void {
    super.clear();
    this.reset();
  }

  /**
   * Remove a key from its bucket
   * @param key - the key
   */
  private unindex(key: string) {
    const bucket = this.bucketOf.get(key);
    if (bucket === undefined) return;
    this.bucketOf.delete(key);
    const keys = this.buckets.get(bucket)!;
    keys.keys.delete(key);
    if (keys.keys.size === 0) {
      this.buckets.delete(bucket);
    }
  }

  /**
   * Read the bucket of a stored value
   * @param value - the stored value
   * @returns its bucket
   */
  private static bucketOfValue(value: unknown): Bucket {
    if (typeof value !== "string") return UNREADABLE;
    let type: unknown;
    try {
      type = JSON.parse(value)?.__type;
    } catch {
      return UNREADABLE;
    }
    return typeof type === "string" && type !== "" ? type : UNTYPED;
  }

  /**
   * Index the keys written since the last read
   */
  private flush() {
    if (this.pending.size === 0) return;
    for (const key of this.pending) {
      const bucket = TypeIndexedMap.bucketOfValue(super.get(key));
      const previous = this.bucketOf.get(key);
      if (previous === bucket) continue;
      this.unindex(key);
      this.bucketOf.set(key, bucket);
      const sequence = this.sequence.get(key)!;
      let keys = this.buckets.get(bucket);
      if (!keys) {
        keys = { keys: new Set(), last: -1, ordered: true };
        this.buckets.set(bucket, keys);
      }
      // A retyped key is appended to its new bucket after keys that follow it in the map: reorder on next read
      if (sequence < keys.last) {
        keys.ordered = false;
      }
      keys.last = Math.max(keys.last, sequence);
      keys.keys.add(key);
    }
    this.pending.clear();
  }

  /**
   * Keys whose stored `__type` is accepted, in map insertion order
   *
   * Unreadable entries (not JSON, not a string) are always returned so the error of reading them surfaces.
   * @param accept - whether entries of a stored type are wanted, called once per distinct type, with undefined for
   *   untyped entries
   * @returns the keys
   */
  keysOfTypes(accept: (type: string | undefined) => boolean): string[] {
    this.flush();
    const selected: BucketKeys[] = [];
    for (const [bucket, keys] of this.buckets) {
      if (bucket === UNREADABLE || accept(bucket === UNTYPED ? undefined : bucket)) {
        selected.push(keys);
      }
    }
    if (selected.length === 0) return [];
    if (selected.length === 1) {
      return [...this.ordered(selected[0]).keys];
    }
    const keys: string[] = [];
    for (const bucket of selected) {
      for (const key of bucket.keys) keys.push(key);
    }
    return keys.sort((a, b) => this.sequence.get(a)! - this.sequence.get(b)!);
  }

  /**
   * Restore the storage order of a bucket
   * @param keys - the bucket
   * @returns the bucket, ordered
   */
  private ordered(keys: BucketKeys): BucketKeys {
    if (!keys.ordered) {
      keys.keys = new Set([...keys.keys].sort((a, b) => this.sequence.get(a)! - this.sequence.get(b)!));
      keys.ordered = true;
    }
    return keys;
  }
}
