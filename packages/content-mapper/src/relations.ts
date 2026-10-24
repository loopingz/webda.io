/**
 * Relation kinds and delete policies, shared by `buildRelations` (discovery) and `processModels` (module generation).
 *
 * A relation is recognised by its type name: the written one, or the one an alias chain leads to
 * (`type OwnedBy<T> = BelongTo<T>` → `BelongTo` → `ModelParent`).
 */
import { getJSDocTags, getTextOfJSDocComment } from "typescript/unstable/ast";
import type { Node } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { SymbolFlags } from "typescript/unstable/sync";
import type { AnalysisContext } from "./plan.ts";

/**
 * Delete policies a relation can declare with `@OnDelete <POLICY>`
 *
 * The runtime type is `DeletePolicy` from `@webda/models`: this list validates the tag at build time (the compiler
 * cannot depend on `@webda/models`, which depends on it for its own build).
 */
export const DELETE_POLICIES = ["CASCADE", "RESTRICT", "SET_NULL", "NONE"] as const;

/**
 * What happens to the dependents of a model when it is deleted
 */
export type DeletePolicy = (typeof DELETE_POLICIES)[number];

/**
 * Relation type aliases of `@webda/models` and the relation type each one is.
 *
 * `ManyToMany<T, K = object>` always resolves to `ModelLinksArray` (`object extends object`), and `Contains<T>` is
 * `ManyToMany<T>`.
 */
export const RELATION_TYPE_ALIASES: Record<string, string> = {
  BelongTo: "ModelParent",
  RelateTo: "ModelLink",
  ManyToOne: "ModelLink",
  OneToOne: "ModelLink",
  OneToMany: "ModelRelated",
  ManyToMany: "ModelLinksArray",
  Contains: "ModelLinksArray"
};

/** `ModelLink*` type names and the link kind each records. */
export const LINK_KINDS: Record<string, string> = {
  ModelLink: "LINK",
  ModelLinksMap: "LINKS_MAP",
  ModelLinksArray: "LINKS_ARRAY",
  ModelLinksSimpleArray: "LINKS_SIMPLE_ARRAY"
};

/** Relation types, the end of an alias chain. */
const RELATION_TYPES = new Set(["ModelParent", "ModelRelated", "ModelsMapped", ...Object.keys(LINK_KINDS)]);

/**
 * @param typeName - a written type name
 * @returns the relation type it is: the alias target, or the name itself
 */
export function relationTypeOf(typeName: string): string {
  return RELATION_TYPE_ALIASES[typeName] ?? typeName;
}

/**
 * A relation type, once its aliases are resolved
 */
export interface RelationType {
  /**
   * `ModelParent`, `ModelRelated`, `ModelsMapped`, a `ModelLink*` type, or the written name when it is none of them
   */
  type: string;
  /**
   * The chain went through `Contains`: the owner owns the listed models
   */
  contains: boolean;
}

/**
 * @param node - a type name
 * @returns its last identifier: `ModelLink` for `models.ModelLink`
 */
function nameOf(node: any): string | undefined {
  if (is.isIdentifier(node)) return node.text;
  if (is.isQualifiedName(node)) return node.right.text;
  return undefined;
}

/**
 * @param ctx - analysis context
 * @param typeName - a type name
 * @returns the type reference an alias declaration of the name stands for, undefined when it is not an alias of one
 */
function aliasTargetOf(ctx: AnalysisContext, typeName: Node): any {
  try {
    let symbol: any = ctx.checker.getSymbolAtLocation(typeName);
    if (symbol && symbol.flags & SymbolFlags.Alias) symbol = ctx.checker.getAliasedSymbol(symbol);
    for (const handle of symbol?.declarations ?? []) {
      const node: any = handle.resolve(ctx.project);
      if (node && is.isTypeAliasDeclaration(node) && node.type && is.isTypeReferenceNode(node.type)) {
        return node.type;
      }
    }
  } catch {
    // Unresolvable: the written name is all there is
  }
  return undefined;
}

/**
 * Resolve the relation type of a property type, following the alias chain
 * @param ctx - analysis context
 * @param typeNode - the property type reference
 * @param written - the written type name
 * @returns the relation type and whether the chain went through `Contains`
 */
export function resolveRelationType(ctx: AnalysisContext, typeNode: any, written: string): RelationType {
  let name: string | undefined = nameOf(typeNode.typeName) ?? written;
  let node = typeNode;
  let contains = false;
  // Bounded: an alias cycle is a compile error anyway
  for (let i = 0; i < 16 && name; i++) {
    if (name === "Contains") contains = true;
    if (RELATION_TYPE_ALIASES[name] || RELATION_TYPES.has(name)) {
      return { type: relationTypeOf(name), contains };
    }
    node = aliasTargetOf(ctx, node.typeName);
    name = node ? nameOf(node.typeName) : undefined;
  }
  return { type: relationTypeOf(written), contains };
}

/**
 * @param member - a property declaration
 * @param tagName - a JSDoc tag name
 * @returns the tag, undefined when the property does not have it
 */
function findTag(member: Node, tagName: string): any {
  try {
    return getJSDocTags(member).find((tag: any) => tag.tagName.text === tagName);
  } catch {
    return undefined;
  }
}

/**
 * Delete policy of a relation and the error of an invalid one
 */
export interface RelationPolicy {
  /**
   * Undefined when it is the default NONE of a link
   */
  onDelete?: DeletePolicy;
  /**
   * Message of an invalid `@OnDelete`
   */
  error?: string;
}

/**
 * Delete policy of a relation property, from its kind and its `@OnDelete <POLICY>` / `@CascadeDelete` tag
 *
 * - `ModelParent` / `BelongTo`: `CASCADE` by default, `SET_NULL` refused (a parent is mandatory)
 * - `Contains`: `CASCADE` by default (the owner deletes the listed models), `SET_NULL` refused
 * - other links: `NONE` by default, returned as undefined
 * @param member - the property declaration
 * @param kind - `PARENT`, `CONTAINS` or `LINK`
 * @param where - `Model.attribute`, for the error messages
 * @returns the policy, and the error when the tag is invalid
 */
export function relationPolicyOf(member: Node, kind: "PARENT" | "CONTAINS" | "LINK", where: string): RelationPolicy {
  const fallback: DeletePolicy | undefined = kind === "LINK" ? undefined : "CASCADE";
  const tag = findTag(member, "OnDelete");
  let policy: string | undefined;
  if (tag) {
    policy = (getTextOfJSDocComment(tag.comment) ?? "").trim().split(/\s+/).shift() || undefined;
  } else if (findTag(member, "CascadeDelete")) {
    policy = "CASCADE";
  }
  if (policy === undefined) return { onDelete: fallback };
  if (!(DELETE_POLICIES as readonly string[]).includes(policy)) {
    return {
      onDelete: fallback,
      error: `${where}: unknown @OnDelete ${policy}, expected one of ${DELETE_POLICIES.join(", ")}`
    };
  }
  if (policy === "SET_NULL" && kind === "PARENT") {
    return {
      onDelete: fallback,
      error:
        `${where}: @OnDelete SET_NULL is not allowed on a ModelParent (BelongTo): a parent is mandatory, ` +
        `use CASCADE, RESTRICT or NONE`
    };
  }
  if (policy === "SET_NULL" && kind === "CONTAINS") {
    return {
      onDelete: fallback,
      error: `${where}: @OnDelete SET_NULL is not allowed on a Contains: the owner holds the keys, use CASCADE, RESTRICT or NONE`
    };
  }
  // NONE is the default of a link: omitted
  return { onDelete: policy === "NONE" && kind === "LINK" ? undefined : (policy as DeletePolicy) };
}

/**
 * A relation of another model whose target is this model, and the policy applied to it when this model is deleted
 */
export interface RelationDependent {
  /**
   * Model declaring the relation
   */
  model: string;
  attribute: string;
  type: string;
  onDelete: DeletePolicy;
}

/**
 * The relations of a model, as read by {@link backfillRelations}
 */
export interface PolicyRelations {
  parent?: { attribute: string; model?: string; onDelete?: DeletePolicy };
  links?: { attribute: string; model?: string; type: string; onDelete?: DeletePolicy; ownership?: "CONTAINS" }[];
  maps?: { attribute: string; model?: string; targetLink: string; cascadeDelete: boolean }[];
  children?: string[];
  dependents?: RelationDependent[];
}

/**
 * Second pass, once every model is known: fill the reverse index on the targets
 *
 * - `children`: the models declaring the target as their parent
 * - `dependents`: every relation targeting the model with a policy other than `NONE`, a parent included. A
 *   `Contains` is not a dependent of its target: the owner applies it to the models it lists. A `ModelsMapped`
 *   tagged `@CascadeDelete` makes its link (`targetLink` of the mapped model) a `CASCADE` dependent of the owner.
 *
 * Only the local models are filled: a target from a dependency keeps its own module.
 * @param models - the relations of each model, by identifier; updated in place
 */
export function backfillRelations(models: Record<string, PolicyRelations>): void {
  const children = new Map<string, Set<string>>();
  const dependents = new Map<string, Map<string, RelationDependent>>();
  const addDependent = (target: string | undefined, dependent: RelationDependent) => {
    if (!target || !models[target]) return;
    if (!dependents.has(target)) dependents.set(target, new Map());
    // A link both tagged and mapped is recorded once
    dependents.get(target)!.set(`${dependent.model}\0${dependent.attribute}`, dependent);
  };
  for (const [name, relations] of Object.entries(models)) {
    const parent = relations.parent;
    if (parent?.model && models[parent.model]) {
      if (!children.has(parent.model)) children.set(parent.model, new Set());
      children.get(parent.model)!.add(name);
    }
    if (parent?.model && (parent.onDelete ?? "CASCADE") !== "NONE") {
      addDependent(parent.model, {
        model: name,
        attribute: parent.attribute,
        type: "PARENT",
        onDelete: parent.onDelete ?? "CASCADE"
      });
    }
    for (const link of relations.links ?? []) {
      if (link.ownership === "CONTAINS" || !link.onDelete || link.onDelete === "NONE") continue;
      addDependent(link.model, { model: name, attribute: link.attribute, type: link.type, onDelete: link.onDelete });
    }
  }
  for (const [name, relations] of Object.entries(models)) {
    for (const map of relations.maps ?? []) {
      if (!map.cascadeDelete || !map.model) continue;
      const link = models[map.model]?.links?.find(l => l.attribute === map.targetLink);
      const type = models[map.model]?.parent?.attribute === map.targetLink ? "PARENT" : (link?.type ?? "LINK");
      addDependent(name, { model: map.model, attribute: map.targetLink, type, onDelete: "CASCADE" });
    }
  }
  for (const [name, relations] of Object.entries(models)) {
    const names = children.get(name);
    if (names?.size) relations.children = [...names].sort();
    const list = dependents.get(name);
    if (list?.size) {
      relations.dependents = [...list.values()].sort(
        (a, b) => a.model.localeCompare(b.model) || a.attribute.localeCompare(b.attribute)
      );
    }
  }
}
