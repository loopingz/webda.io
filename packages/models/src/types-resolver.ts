import type { ModelClass } from "./storable.js";

/**
 * How a stored `__type` maps to a model
 *
 * - `current`: the stored value is the model identifier
 * - `legacy`: a Webda 3 form (short name, other case, alias) of the model identifier
 * - `unknown`: no model matches
 * - `ambiguous`: several models match at the same step, none is picked
 */
export type TypeResolutionStatus = "current" | "legacy" | "unknown" | "ambiguous";

/**
 * Result of resolving a stored `__type`
 */
export interface TypeResolution {
  /** How the value matched */
  status: TypeResolutionStatus;
  /** The model, for `current` and `legacy` */
  model?: ModelClass;
  /** Current identifier of the model, for `current` and `legacy` */
  identifier?: string;
  /** Identifiers matched at the ambiguous step, sorted */
  candidates?: string[];
}

/**
 * Options of {@link ModelTypeResolver}
 */
export interface ModelTypeResolverOptions {
  /**
   * Application namespace, tried first for a value without `/`
   *
   * @default "Webda"
   */
  namespace?: string;
  /**
   * Only match exact identifiers: the behaviour of repositories whose model is not part of an application
   *
   * @default false
   */
  exactOnly?: boolean;
}

/**
 * Own Metadata of a class: a subclass without its own Metadata does not inherit its parent's identifier
 * @param clazz - the class
 * @returns its own Metadata
 */
function ownMetadata(clazz: any): any {
  return clazz && Object.prototype.hasOwnProperty.call(clazz, "Metadata") ? clazz.Metadata : undefined;
}

/**
 * Add a class to a multi-valued index
 * @param index - the index
 * @param key - the key
 * @param clazz - the class
 */
function addTo(index: Map<string, Set<ModelClass>>, key: string, clazz: ModelClass): void {
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(clazz);
}

/**
 * Resolve the `__type` stored in a row (Webda 3 short, lower-case or renamed forms included) to a model
 *
 * Resolution order, first match wins:
 * 1. the exact identifier (or a map key that is not the identifier);
 * 2. a `@WebdaAlias`, exact, then case-insensitive;
 * 3. an identifier, case-insensitive;
 * 4. for a value without `/`: `<namespace>/<value>` then `Webda/<value>`, case-insensitive, identifiers then aliases;
 * 5. otherwise unknown.
 *
 * Two different models matching at the same step make the value ambiguous: it resolves to nothing.
 */
export class ModelTypeResolver {
  /** Application namespace */
  readonly namespace: string;
  /** Only exact identifiers match */
  readonly exactOnly: boolean;
  /** Exact names (identifiers and extra map keys) to class */
  protected readonly byName = new Map<string, ModelClass>();
  /** Current identifier of each class */
  protected readonly identifiers = new Map<ModelClass, string>();
  /** Map keys of a class that are not its identifier */
  protected readonly extraNames = new Map<ModelClass, string[]>();
  /** Lower-case identifiers and extra names */
  protected readonly lowerNames = new Map<string, Set<ModelClass>>();
  /** Aliases */
  protected readonly aliases = new Map<string, Set<ModelClass>>();
  /** Lower-case aliases */
  protected readonly lowerAliases = new Map<string, Set<ModelClass>>();
  /** Cache of resolutions */
  protected readonly resolutions = new Map<string, TypeResolution>();
  /** Cache of families */
  protected readonly families = new Map<ModelClass, ModelClass[]>();
  /** Cache of accepted types */
  protected readonly accepted = new Map<ModelClass, string[]>();

  /**
   * @param models - models by identifier (an application model map), or a list of classes carrying Metadata
   * @param options - namespace and exact mode
   */
  constructor(models: Record<string, ModelClass | undefined> | ModelClass[], options: ModelTypeResolverOptions = {}) {
    this.namespace = options.namespace ?? "Webda";
    this.exactOnly = options.exactOnly ?? false;
    const entries: [string | undefined, ModelClass][] = Array.isArray(models)
      ? models.filter(Boolean).map(model => [undefined, model] as [undefined, ModelClass])
      : (Object.entries(models).filter(([, model]) => !!model) as [string, ModelClass][]);
    for (const [key, clazz] of entries) {
      const identifier: string | undefined = ownMetadata(clazz)?.Identifier ?? key;
      if (!identifier) continue;
      this.addName(identifier, clazz, false);
      if (key && key !== identifier) {
        this.addName(key, clazz, true);
      }
    }
  }

  /**
   * Index a name of a class
   * @param name - identifier or extra name
   * @param clazz - the class
   * @param extra - true for a map key that is not the identifier
   */
  protected addName(name: string, clazz: ModelClass, extra: boolean): void {
    if (!this.byName.has(name)) {
      this.byName.set(name, clazz);
    }
    addTo(this.lowerNames, name.toLowerCase(), clazz);
    if (extra) {
      this.extraNames.set(clazz, [...(this.extraNames.get(clazz) ?? []), name]);
      return;
    }
    if (!this.identifiers.has(clazz)) {
      this.identifiers.set(clazz, name);
    }
    for (const alias of ownMetadata(clazz)?.Aliases ?? []) {
      addTo(this.aliases, alias, clazz);
      addTo(this.lowerAliases, alias.toLowerCase(), clazz);
    }
  }

  /**
   * Resolver of the hierarchy of a model only, exact identifiers only
   *
   * Used for repositories whose model is not part of the installed application: today's exact matching.
   * @param model - the model
   * @returns the resolver
   */
  static forHierarchy(model: ModelClass): ModelTypeResolver {
    if (!model) {
      return new ModelTypeResolver({}, { exactOnly: true });
    }
    const classes: any[] = [];
    const queue: any[] = [model];
    while (queue.length) {
      const clazz = queue.shift();
      if (!clazz || classes.includes(clazz)) continue;
      classes.push(clazz);
      queue.push(...(clazz.Metadata?.Subclasses ?? []).filter((sub: any) => typeof sub === "function"));
    }
    for (
      let parent = Object.getPrototypeOf(model);
      parent && parent !== Function.prototype;
      parent = Object.getPrototypeOf(parent)
    ) {
      if (ownMetadata(parent)?.Identifier) classes.push(parent);
    }
    const record: Record<string, ModelClass> = {};
    for (const clazz of classes) {
      // The repository model may inherit its Metadata (a bare subclass used directly)
      const identifier = (clazz === model ? clazz.Metadata : ownMetadata(clazz))?.Identifier;
      if (identifier && !record[identifier]) record[identifier] = clazz;
    }
    return new ModelTypeResolver(record, { exactOnly: true });
  }

  /**
   * @param model - a class
   * @returns true when the class is one of the models of this resolver
   */
  knows(model: ModelClass): boolean {
    return this.identifiers.has(model);
  }

  /**
   * @param model - a class
   * @returns its current identifier, undefined when the class is not known
   */
  getIdentifier(model: ModelClass): string | undefined {
    return this.identifiers.get(model);
  }

  /**
   * Resolve a stored `__type`
   * @param stored - the stored value
   * @returns the resolution
   */
  resolve(stored: string): TypeResolution {
    let resolution = this.resolutions.get(stored);
    if (!resolution) {
      resolution = this.computeResolution(stored);
      this.resolutions.set(stored, resolution);
    }
    return resolution;
  }

  /**
   * @param stored - the stored value
   * @returns the model, undefined when unknown or ambiguous
   */
  resolveStoredType(stored: string): ModelClass | undefined {
    return this.resolve(stored).model;
  }

  /**
   * Run the resolution steps
   * @param stored - the stored value
   * @returns the resolution
   */
  protected computeResolution(stored: string): TypeResolution {
    if (typeof stored !== "string" || stored === "") {
      return { status: "unknown" };
    }
    const exact = this.byName.get(stored);
    if (exact) {
      return this.found(stored, exact);
    }
    if (this.exactOnly) {
      return { status: "unknown" };
    }
    const lower = stored.toLowerCase();
    const steps: (Set<ModelClass> | undefined)[] = [
      this.aliases.get(stored),
      this.lowerAliases.get(lower),
      this.lowerNames.get(lower)
    ];
    if (!stored.includes("/")) {
      // Webda 3 completeNamespace order: the application namespace first, then Webda
      for (const namespace of new Set([this.namespace, "Webda"])) {
        const name = `${namespace}/${stored}`.toLowerCase();
        steps.push(this.lowerNames.get(name), this.lowerAliases.get(name));
      }
    }
    for (const step of steps) {
      if (!step || step.size === 0) continue;
      if (step.size > 1) {
        return {
          status: "ambiguous",
          candidates: [...step].map(clazz => this.identifiers.get(clazz)!).sort()
        };
      }
      return this.found(stored, [...step][0]);
    }
    return { status: "unknown" };
  }

  /**
   * @param stored - the stored value
   * @param model - the matched model
   * @returns the resolution of a match
   */
  protected found(stored: string, model: ModelClass): TypeResolution {
    const identifier = this.identifiers.get(model)!;
    return { status: stored === identifier ? "current" : "legacy", model, identifier };
  }

  /**
   * The model and all its transitive subclasses: from `Metadata.Subclasses` (direct only), then any known class
   * extending the model that the metadata does not list
   * @param model - the model
   * @returns the model first, then its subclasses
   */
  family(model: ModelClass): ModelClass[] {
    let family = this.families.get(model);
    if (family) return family;
    family = [];
    const queue: any[] = [model];
    while (queue.length) {
      const clazz = queue.shift();
      if (!clazz || family.includes(clazz)) continue;
      family.push(clazz);
      for (const sub of clazz.Metadata?.Subclasses ?? []) {
        queue.push(typeof sub === "string" ? this.byName.get(sub) : sub);
      }
    }
    for (const clazz of this.identifiers.keys()) {
      if (!family.includes(clazz) && (clazz as any).prototype instanceof (model as any)) {
        family.push(clazz);
      }
    }
    this.families.set(model, family);
    return family;
  }

  /**
   * @param model - the model
   * @returns the current identifiers of the model and its transitive subclasses
   */
  identifiersOf(model: ModelClass): string[] {
    const identifiers: string[] = [];
    for (const clazz of this.family(model)) {
      const identifier = this.identifiers.get(clazz) ?? (clazz as any).Metadata?.Identifier;
      if (identifier && !identifiers.includes(identifier)) identifiers.push(identifier);
    }
    return identifiers;
  }

  /**
   * Every stored string that resolves to the model or one of its transitive subclasses: identifiers, short names,
   * lower-case forms, aliases and their short and lower-case forms
   * @param model - the model
   * @returns the strings, deduplicated
   */
  acceptedTypes(model: ModelClass): string[] {
    let accepted = this.accepted.get(model);
    if (accepted) return accepted;
    accepted = [];
    for (const clazz of this.family(model)) {
      const identifier = this.identifiers.get(clazz);
      if (!identifier) continue;
      const names = [identifier, ...(this.extraNames.get(clazz) ?? []), ...(ownMetadata(clazz)?.Aliases ?? [])];
      for (const name of names) {
        const short = name.split("/").pop()!;
        for (const candidate of [name, short, name.toLowerCase(), short.toLowerCase()]) {
          if (!accepted.includes(candidate) && this.resolve(candidate).model === clazz) {
            accepted.push(candidate);
          }
        }
      }
    }
    this.accepted.set(model, accepted);
    return accepted;
  }

  /**
   * Whether a stored row belongs to a model
   * @param model - the model queried
   * @param stored - the stored `__type`, undefined for an untyped row
   * @param tableRoot - the model owning the untyped rows of the table, when known
   * @returns true when the row resolves to the model or one of its transitive subclasses; an untyped row belongs to
   *   the table root and its ancestors (to every model when the root is not known), and so does a row typed as a
   *   strict ancestor of the table root
   */
  belongsToModel(model: ModelClass, stored: string | undefined | null, tableRoot?: ModelClass): boolean {
    const ownedByRoot = () =>
      !tableRoot || tableRoot === model || (tableRoot as any).prototype instanceof (model as any);
    if (stored === undefined || stored === null || stored === "") {
      return ownedByRoot();
    }
    const resolved = this.resolveStoredType(stored);
    if (resolved === undefined) return false;
    if (tableRoot && (tableRoot as any).prototype instanceof (resolved as any)) {
      // Typed as an ancestor of the table root (e.g. written before the application subclassed the model)
      return ownedByRoot();
    }
    return this.family(model).includes(resolved);
  }
}

/** Global slot: shared by every copy of this module loaded in the process */
const SLOT = Symbol.for("webda.models.typeResolver");
/** Resolver used when nothing is installed and no model is given */
let empty: ModelTypeResolver | undefined;

/**
 * Install the resolver of the application (done by `@webda/core` when models load)
 * @param resolver - the resolver, undefined to uninstall
 */
export function setTypeResolver(resolver: ModelTypeResolver | undefined): void {
  (globalThis as any)[SLOT] = resolver;
}

/**
 * @returns the installed resolver, if any
 */
export function useTypeResolver(): ModelTypeResolver | undefined {
  return (globalThis as any)[SLOT];
}

/**
 * Resolver to use for a model: the installed one when it knows the model, else the model's own hierarchy (exact
 * identifiers only)
 * @param model - the model, if any
 * @returns the resolver
 */
export function getTypeResolver(model?: ModelClass): ModelTypeResolver {
  const installed = useTypeResolver();
  if (installed && (model === undefined || installed.knows(model))) {
    return installed;
  }
  if (model !== undefined) {
    return ModelTypeResolver.forHierarchy(model);
  }
  return (empty ??= new ModelTypeResolver({}, { exactOnly: true }));
}

/**
 * @param stored - a stored `__type`
 * @returns the model it resolves to with the installed resolver
 */
export function resolveStoredType(stored: string): ModelClass | undefined {
  return getTypeResolver().resolveStoredType(stored);
}

/**
 * @param model - the model
 * @returns every stored string resolving to the model or a transitive subclass
 */
export function acceptedTypes(model: ModelClass): string[] {
  return getTypeResolver(model).acceptedTypes(model);
}

/**
 * @param model - the model
 * @param stored - the stored `__type`
 * @param tableRoot - the model owning the untyped rows
 * @returns true when the row belongs to the model
 */
export function belongsToModel(model: ModelClass, stored: string | undefined | null, tableRoot?: ModelClass): boolean {
  return getTypeResolver(model).belongsToModel(model, stored, tableRoot);
}
