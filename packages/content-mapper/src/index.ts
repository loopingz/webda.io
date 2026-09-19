/**
 * Webda's compile-time code generation, as a TypeScript 7.1 content mapper.
 *
 * TypeScript 7 removed custom emit transformers, `ts-patch` and language-service
 * plugins. This package replaces them with the supported mechanism: a content
 * mapper process that rewrites model and service sources into ordinary
 * TypeScript before the compiler sees them, plus span maps so diagnostics,
 * hover and rename still land on the authored text.
 *
 * Two hosts share one implementation of the transform:
 *
 * - {@link WarmSession} — used by the mapper process ({@link ./server.ts}) to
 *   serve the editor and `tsc`.
 * - {@link runTwoPass} — used by `@webda/compiler` to type-check and emit.
 *
 * See `docs/contribute/TypeScript 7 Content Mappers.md` for the rationale.
 */
export { DEFAULT_COERCIONS } from "./coercions.ts";
export type { CoercionRegistry, CoercionRule } from "./coercions.ts";

export { baseNames, classesOf, isStatic, memberName, openSession, textOf, triviaOf } from "./context.ts";
export type { Session } from "./context.ts";

export { applyEdits, mergePlan } from "./plan.ts";
export type { AnalysisContext, Edit, FileEdits, Generator } from "./plan.ts";

export { accessorsGenerator } from "./generators/accessors.ts";
export type { AccessorOptions } from "./generators/accessors.ts";
export { loadParametersGenerator } from "./generators/loadparameters.ts";

export { buildMappedText, SpanMapKind } from "./spans.ts";
export type { MappedText, SpanMapping } from "./spans.ts";

export { WarmSession } from "./session.ts";
export type { TransformOutcome, TransformTiming, WarmSessionOptions } from "./session.ts";

export { runTwoPass } from "./twopass.ts";
export type { TwoPassOptions, TwoPassResult } from "./twopass.ts";
