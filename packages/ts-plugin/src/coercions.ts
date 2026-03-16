"use strict";

/**
 * Defines the widened setter type for a coercible property type.
 *
 * When the compiler's morpher transforms `createdAt: Date` into a getter/setter pair,
 * the setter accepts `string | number | Date`. This registry tells the language service
 * plugin which types get this treatment, so the IDE can:
 * - Show the widened setter type on hover
 * - Suppress false TS2322 errors when assigning e.g. a string to a Date field
 *
 * This mirrors the COERCION_REGISTRY in @webda/compiler's accessors.ts.
 */
export interface CoercionRule {
  /** The wider type accepted by the setter (e.g. "string | number | Date" for Date fields). */
  setterType: string;
}

export type CoercionRegistry = Record<string, CoercionRule>;

/**
 * Default coercion rules matching @webda/compiler's COERCION_REGISTRY.
 * Extend via the plugin config in tsconfig.json.
 */
export const DEFAULT_COERCIONS: CoercionRegistry = {
  Date: {
    setterType: "string | number | Date"
  }
};
