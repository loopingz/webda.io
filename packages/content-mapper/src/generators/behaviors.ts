/**
 * Behaviour generator — the typed replacement for
 * `@webda/ts-plugin/transforms/behaviors.ts`.
 *
 * The original builds its output with `ts.factory`, which TypeScript 7 removed.
 * The generated members are ordinary TypeScript, so they are emitted as text
 * through the shared plan model instead.
 *
 * Two independent augmentations:
 *
 * | target | generated |
 * |---|---|
 * | class tagged `@WebdaBehavior` | `[WEBDA_STORAGE]` slot, `parent` getter, `toJSON()` |
 * | class holding Behaviour-typed properties | `__hydrateBehaviors(rawData?)` |
 *
 * A class can be both. Author-written `toJSON` or `__hydrateBehaviors` is never
 * replaced.
 */
import type { SourceFile } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { classesOf, isStatic, memberName } from "../context.ts";
import type { AnalysisContext, Edit, FileEdits, Generator } from "../plan.ts";

/**
 * Storage slot backing a Behaviour's `parent` reference.
 *
 * Must match `BEHAVIOR_PARENT_KEY` in `@webda/ts-plugin`: the per-Behaviour
 * `parent` getter reads it and `toJSON` filters it out, so a mismatch silently
 * serialises the parent back into stored data.
 */
export const BEHAVIOR_PARENT_KEY = "__parent__";

/** Options for the behaviour generator. */
export interface BehaviorOptions {
  /** Module specifier providing `WEBDA_STORAGE`. */
  storageModule?: string;
}

/**
 * Whether a class carries the `@WebdaBehavior` JSDoc tag.
 *
 * Discovery is by tag rather than decorator, matching the compiler, so the
 * marker leaves no runtime trace.
 * @param ctx - analysis context
 * @param sf - file declaring the class
 * @param cls - the class declaration
 * @returns true when the class is a Behaviour
 */
function hasBehaviorTag(ctx: AnalysisContext, sf: SourceFile, cls: any): boolean {
  return /@WebdaBehavior\b/.test(ctx.triviaOf(sf, cls));
}

/**
 * Resolve a property's type to a Behaviour class name.
 *
 * Returns undefined for primitives, for classes without the tag, and for names
 * that reach the file only through a type-only import — referencing those as a
 * value is erased at emit and produces TS1361.
 * @param ctx - analysis context
 * @param sf - file holding the property
 * @param typeNode - the property's type node
 * @returns the Behaviour class name, when usable at runtime
 */
function resolveBehaviorClass(ctx: AnalysisContext, sf: SourceFile, typeNode: any): string | undefined {
  const type = ctx.checker.getTypeFromTypeNode(typeNode);
  if (!type) return undefined;

  const symbol = (type as any).getSymbol?.() ?? (type as any).symbol;
  const name = symbol?.name;
  if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return undefined;

  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const node = declaration?.resolve(ctx.project);
  if (!node || !is.isClassDeclaration(node)) return undefined;

  const owner = (node as any).getSourceFile?.() ?? (node as any)._sourceFile;
  if (!owner || !/@WebdaBehavior\b/.test(ctx.triviaOf(owner, node))) return undefined;

  if (isTypeOnlyImport(sf, name)) return undefined;
  return name;
}

/**
 * Whether a name reaches this file only through a type-only import.
 * @param sf - the file that will contain the generated reference
 * @param name - identifier to be used as a value
 * @returns true when the name is imported for types only
 */
function isTypeOnlyImport(sf: SourceFile, name: string): boolean {
  for (const statement of sf.statements) {
    if (!is.isImportDeclaration(statement)) continue;
    const clause: any = (statement as any).importClause;
    const elements = clause?.namedBindings?.elements;
    if (!elements) continue;
    for (const element of elements) {
      if (element.name?.text === name && (clause.isTypeOnly || element.isTypeOnly)) return true;
    }
  }
  return false;
}

/**
 * Whether the class already declares the `[WEBDA_STORAGE]` slot.
 *
 * The name is computed, so `memberName` returns undefined for it and a
 * name-based lookup silently misses it — injecting a second declaration then
 * produces TS2300/TS2687/TS2416 against the inherited one.
 * @param ctx - analysis context
 * @param sf - file declaring the class
 * @param cls - the class declaration
 * @returns true when a storage slot is already declared
 */
function hasStorageSlot(ctx: AnalysisContext, sf: SourceFile, cls: any): boolean {
  for (const member of cls.members ?? []) {
    const name = (member as any).name;
    if (name && /\bWEBDA_STORAGE\b/.test(ctx.textOf(sf, name))) return true;
  }

  // The slot may be inherited with a narrower shape — `@webda/core`'s binary
  // service declares `protected [WEBDA_STORAGE]: { service: ... }`. Redeclaring
  // it as a loose record is TS2416, and skipping the redeclaration keeps the
  // base type intact. Unique-symbol keys surface as `__@WEBDA_STORAGE@<id>`.
  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  const declared = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  for (const property of (declared as any)?.getProperties?.() ?? []) {
    if (/WEBDA_STORAGE/.test(property.name ?? "")) return true;
  }
  return false;
}

/**
 * Names of members the class already declares.
 * @param cls - the class declaration
 * @returns declared member names
 */
function declaredMembers(cls: any): Set<string> {
  const names = new Set<string>();
  for (const member of cls.members ?? []) {
    const name = memberName(member);
    if (name) names.add(name);
  }
  return names;
}

/**
 * The `toJSON` injected into Behaviour classes.
 *
 * Copies own properties, then merges the storage slot while dropping the parent
 * back-reference — serialising it would create a cycle.
 * @param i - indentation of class members
 * @returns generated source
 */
function renderToJSON(i: string): string {
  return [
    `${i}toJSON() {`,
    `${i}  const result: Record<string, any> = {};`,
    `${i}  for (const key of Object.keys(this)) {`,
    `${i}    result[key] = (this as any)[key];`,
    `${i}  }`,
    `${i}  const storage: Record<string, any> | undefined = (this as any)[WEBDA_STORAGE];`,
    `${i}  if (storage) {`,
    `${i}    for (const key of Object.keys(storage)) {`,
    `${i}      if (key !== ${JSON.stringify(BEHAVIOR_PARENT_KEY)}) {`,
    `${i}        result[key] = storage[key];`,
    `${i}      }`,
    `${i}    }`,
    `${i}  }`,
    `${i}  return result;`,
    `${i}}`
  ].join("\n");
}

/**
 * One hydration block, for a single Behaviour-typed property.
 *
 * Takes the current value or the raw stored value, coerces it into a Behaviour
 * instance, and links it back to its owner.
 * @param property - property name
 * @param behaviorClass - Behaviour class to instantiate
 * @param i - indentation of the method body
 * @returns generated source
 */
function renderHydrationBlock(property: string, behaviorClass: string, i: string): string {
  const key = JSON.stringify(property);
  return [
    `${i}{`,
    `${i}  let v: any = this.${property};`,
    `${i}  if (rawData !== undefined && rawData !== null && rawData[${key}] !== undefined) {`,
    `${i}    v = rawData[${key}];`,
    `${i}  }`,
    `${i}  if (!(v instanceof ${behaviorClass})) {`,
    `${i}    const inst = new ${behaviorClass}();`,
    `${i}    if (v !== undefined && v !== null) {`,
    `${i}      Object.assign(inst, v);`,
    `${i}    }`,
    `${i}    v = inst;`,
    `${i}  }`,
    `${i}  (v as any)[WEBDA_STORAGE] = (v as any)[WEBDA_STORAGE] || {};`,
    `${i}  (v as any)[WEBDA_STORAGE][${JSON.stringify(BEHAVIOR_PARENT_KEY)}] = { instance: this, attribute: ${key} };`,
    `${i}  this.${property} = v;`,
    `${i}}`
  ].join("\n");
}

/**
 * Create the behaviour generator.
 * @param options - generator options
 * @returns a generator
 */
export function behaviorsGenerator(options: BehaviorOptions = {}): Generator {
  const storageModule = options.storageModule ?? "@webda/models";

  return {
    name: "behaviors",
    analyze(ctx: AnalysisContext): FileEdits[] {
      const out: FileEdits[] = [];

      for (const sf of ctx.sourceFiles) {
        const edits: Edit[] = [];
        let needsStorage = false;

        for (const cls of classesOf(sf)) {
          const existing = declaredMembers(cls);
          // Members start immediately after the class's `{`; the closing brace
          // is the last character of the declaration.
          const openPos = (cls.members as any)?.pos ?? undefined;
          const closePos = cls.end - 1;
          if (openPos === undefined) continue;

          const memberIndent = `${ctx.textOf(sf, cls).match(/\n([ \t]+)\S/)?.[1] ?? "  "}`;

          if (hasBehaviorTag(ctx, sf, cls)) {
            needsStorage = true;
            if (!hasStorageSlot(ctx, sf, cls)) {
              edits.push({
                start: openPos, end: openPos,
                text: `\n${memberIndent}[WEBDA_STORAGE]: Record<string, any> = {};`,
                source: "behaviors"
              });
            }
            if (!existing.has("parent")) {
              edits.push({
                start: closePos, end: closePos,
                text: `${memberIndent}get parent() { return this[WEBDA_STORAGE][${JSON.stringify(
                  BEHAVIOR_PARENT_KEY
                )}]; }\n`,
                source: "behaviors"
              });
            }
            // An author-written toJSON wins; replacing it would drop their shape.
            if (!existing.has("toJSON")) {
              edits.push({
                start: closePos, end: closePos,
                text: `${renderToJSON(memberIndent)}\n`,
                source: "behaviors"
              });
            }
          }

          // Behaviour-typed properties anywhere gain hydration.
          if (existing.has("__hydrateBehaviors")) continue;
          const blocks: string[] = [];
          for (const member of cls.members ?? []) {
            if (!is.isPropertyDeclaration(member) || isStatic(member)) continue;
            const name = memberName(member);
            if (!name || !(member as any).type) continue;
            const behaviorClass = resolveBehaviorClass(ctx, sf, (member as any).type);
            if (!behaviorClass) continue;
            blocks.push(renderHydrationBlock(name, behaviorClass, `${memberIndent}  `));
          }
          if (!blocks.length) continue;

          needsStorage = true;
          edits.push({
            start: closePos, end: closePos,
            text:
              `${memberIndent}protected __hydrateBehaviors(rawData?: any): void {\n` +
              `${blocks.join("\n")}\n` +
              `${memberIndent}}\n`,
            source: "behaviors"
          });
        }

        if (edits.length) {
          if (needsStorage && !/\bWEBDA_STORAGE\b/.test(sf.text)) {
            edits.push({
              start: 0, end: 0,
              text: `import { WEBDA_STORAGE } from ${JSON.stringify(storageModule)};\n`,
              source: "behaviors"
            });
          }
          out.push({ fileName: sf.fileName, edits });
        }
      }

      return out;
    }
  };
}
