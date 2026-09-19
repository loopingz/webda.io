/**
 * Shared types for the TS7 codegen prototype.
 *
 * This mirrors the shape of `ResolvedCoercion` in
 * `packages/ts-plugin/src/transforms/accessors.ts`, but is produced by the
 * TypeScript 7 (`typescript/unstable/*`) API instead of the TS 5/6 compiler API.
 */

/** How the setter coerces the incoming value. */
export type CoercionKind = "builtin" | "set-method";

/** A single property that will be rewritten into a get/set accessor pair. */
export interface ResolvedCoercion {
  /** Property name, e.g. `createdAt`. */
  name: string;
  /** Declared (read) type as written in source, e.g. `Date`. */
  typeName: string;
  /** Widened setter parameter type, e.g. `string | number | Date`. */
  setterType: string;
  /** Which coercion strategy the setter body uses. */
  coercionKind: CoercionKind;
  /** Byte offset of the start of the property declaration (after leading trivia). */
  start: number;
  /** Byte offset of the end of the property declaration. */
  end: number;
  /** Original source text of the declaration, retained for comment preservation. */
  originalText: string;
}

/** A class that qualifies for accessor generation. */
export interface ClassPlan {
  className: string;
  /** Whether the class is a Webda model (drives `toJSON` generation). */
  isModel: boolean;
  /** Whether the class already declares a `toJSON` member. */
  hasToJSON: boolean;
  /** Insertion offset for generated members (just before the closing `}`). */
  membersEnd: number;
  fields: ResolvedCoercion[];
}

/** The full rewrite plan for one source file. */
export interface FilePlan {
  fileName: string;
  classes: ClassPlan[];
  /** Offset at which a generated import statement should be inserted. */
  importInsertPos: number;
  /** True when the file already imports `WEBDA_STORAGE`. */
  hasStorageImport: boolean;
  /**
   * When the storage module is already imported with a named-import clause,
   * this is the offset just inside its `{`, so `WEBDA_STORAGE` can be merged
   * into the existing statement rather than duplicating the import.
   */
  storageNamedInsertPos?: number;
}

/** Defines the widened setter type for a coercible property type. */
export interface CoercionRule {
  setterType: string;
  /** Expression template for the setter body; `$v` is the incoming value. */
  coerce: (v: string) => string;
}

export type CoercionRegistry = Record<string, CoercionRule>;

/**
 * Default coercion rules, matching `DEFAULT_COERCIONS` in
 * `packages/ts-plugin/src/coercions.ts`.
 */
export const DEFAULT_COERCIONS: CoercionRegistry = {
  Date: {
    setterType: "string | number | Date",
    coerce: v => `new Date(${v})`
  }
};

/** Options controlling analysis. */
export interface CodegenOptions {
  /** Base class names that mark a class as a Webda model. */
  modelBases?: Set<string>;
  /** Treat every class as eligible, not just models. */
  accessorsForAll?: boolean;
  /** Module specifier providing `WEBDA_STORAGE`. */
  storageModule?: string;
  /** Coercion registry. */
  coercions?: CoercionRegistry;
}
