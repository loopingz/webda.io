/**
 * Path segments that are never read or written: they name members of `Object.prototype`
 */
const UNSAFE_SEGMENTS = new Set<string>(["__proto__", "constructor", "prototype"]);

/**
 * Selected paths as a tree: `true` selects the whole value, a map selects some of its fields
 */
type FieldTree = Map<string, FieldTree | true>;

/**
 * Marks a value that is not part of the projection
 */
const OMIT = Symbol("omit");

/**
 * Build the tree of the selected paths: siblings merge, and a path selected with one of its parents is the parent
 * @param paths - dotted field paths
 * @returns the tree
 */
function buildFieldTree(paths: Iterable<string>): FieldTree {
  const root: FieldTree = new Map();
  for (const path of paths) {
    const segments = String(path).split(".");
    if (segments.some(segment => segment === "" || UNSAFE_SEGMENTS.has(segment))) {
      continue;
    }
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const child = node.get(segments[i]);
      if (child === true) {
        // A parent of this path is already selected whole
        break;
      }
      if (i === segments.length - 1) {
        node.set(segments[i], true);
      } else if (child) {
        node = child;
      } else {
        const next: FieldTree = new Map();
        node.set(segments[i], next);
        node = next;
      }
    }
  }
  return root;
}

/**
 * Whether a path can continue inside a value: an object that is not a date or a binary value
 * @param value - the value
 * @returns true for an object with fields
 */
function hasFields(value: any): boolean {
  return value !== null && typeof value === "object" && !(value instanceof Date) && !ArrayBuffer.isView(value);
}

/**
 * Keep the selected fields of a value
 * @param value - an object, or an array whose elements are projected one by one
 * @param tree - the selected fields
 * @returns the projected value, {@link OMIT} when the paths go through a scalar or `null`
 */
function projectValue(value: any, tree: FieldTree): any {
  if (Array.isArray(value)) {
    return value.map(item => projectValue(item, tree)).filter(item => item !== OMIT);
  }
  if (!hasFields(value)) {
    return OMIT;
  }
  const result: any = {};
  // The keys of the value, in its order: only own fields are read, and only selected names are written
  for (const key of Object.keys(value)) {
    const selected = tree.get(key);
    if (selected === undefined) {
      continue;
    }
    const projected = selected === true ? value[key] : projectValue(value[key], selected);
    if (projected !== OMIT && projected !== undefined) {
      result[key] = projected;
    }
  }
  return result;
}

/**
 * Keep only some fields of an object: the projection of a `SELECT a, b.c` field list
 *
 * - `b.c` keeps `{ b: { c } }`; sibling paths merge (`b.c, b.d`), and a path listed with one of its parents
 *   (`b, b.c`) keeps the whole parent. Duplicates are ignored.
 * - A path through an array applies to each element: `tags.name` on `tags: [{ name, color }]` keeps
 *   `tags: [{ name }]`.
 * - A path through a scalar or `null` selects nothing: the field is omitted (an array element is dropped). An object
 *   on the path is kept, even when none of its fields is selected.
 * - A missing value is omitted, an existing `null` is kept.
 * - Keys keep the order of the object, not the order of the paths.
 * - A path with a `__proto__`, `constructor` or `prototype` segment is ignored.
 *
 * The object is not changed. Values selected whole are returned by reference, not copied.
 *
 * @param object - the object to project (an array is projected element by element)
 * @param paths - dotted field paths to keep
 * @returns a new object holding the selected fields; a value that is not an object is returned as is
 */
export function projectFields<T = any>(object: T, paths: Iterable<string>): Partial<T> {
  const projected = projectValue(object, buildFieldTree(paths));
  return projected === OMIT ? object : projected;
}
