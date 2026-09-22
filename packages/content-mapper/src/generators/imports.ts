/**
 * Make a name usable as a runtime value in a file, or report that it cannot be.
 *
 * Generated code constructs things — `new ModelLink(User)`,
 * `new ModelRelated(Ident, this, "_user")`, `new BinariesImpl()` — so every
 * name it mentions has to survive emit as a value. Authors routinely import
 * those names as types only, or not at all (`BelongTo<User>` names the alias,
 * not the `ModelLink` it resolves to). The TypeScript 6 transformers papered
 * over this by synthesising imports from the declaring file's path, which for
 * workspace packages — symlinks — produced monorepo-relative specifiers like
 * `"../../../models/lib/relations.js"` that break once installed from npm.
 *
 * Only two moves are allowed, and anything else is refused:
 *
 * 1. **Promote** an existing `import type` of the name to a value import. The
 *    author already chose the module; only the erasure changes.
 * 2. **Add** `import { Name }` from a module the file already imports another
 *    name from, when the checker confirms that module exports `Name` as a
 *    value. The specifier is the one the author wrote, never a computed path.
 *
 * Each import is emitted as its own statement and each promotion as a fixed
 * range, so two generators that need the same name produce identical edits,
 * which `mergePlan` collapses — rather than duplicate bindings, which are
 * TS2300.
 */
import { SymbolFlags } from "typescript/unstable/sync";
import type { SourceFile } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import type { AnalysisContext, Edit } from "../plan.ts";

/** Collects the import edits one file needs. */
export class ValueImports {
  private readonly edits = new Map<string, Edit>();

  /**
   * @param ctx - analysis context
   * @param sf - the file the generated code goes into
   * @param source - generator name, recorded on the edits
   */
  constructor(
    private readonly ctx: AnalysisContext,
    private readonly sf: SourceFile,
    private readonly source: string
  ) {}

  /**
   * Ensure `name` is a runtime value in this file.
   * @param name - identifier the generated code will use as a value
   * @param location - node the reference will appear at, for scope lookup
   * @param via - names the file already imports whose module may export
   *   `name`, nearest first — e.g. `BelongTo` for `ModelLink`
   * @returns true when the name is, or will be, available as a value
   */
  ensure(name: string, location: unknown, via: string[] = []): boolean {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;

    const importing = this.importOf(name);
    if (importing) {
      if (importing.typeOnly) this.promote(importing);
      return true;
    }
    // Declared in this file, or global.
    if (this.ctx.checker.resolveName(name, SymbolFlags.Value, location as never)) return true;

    for (const hint of via) {
      const hinted = this.importOf(hint);
      if (!hinted || !this.moduleExportsValue(hinted.declaration, name)) continue;
      const text = `import { ${name} } from ${this.ctx.textOf(this.sf, hinted.declaration.moduleSpecifier)};\n`;
      this.edits.set(`add:${name}`, { start: 0, end: 0, text, source: this.source });
      return true;
    }
    return false;
  }

  /**
   * Ensure `name` can be used in a type position in this file.
   *
   * The type-level twin of {@link ensure}: a setter's parameter type is
   * printed from the relation's own `set` signature, so it can name types the
   * file never imports — `PrimaryKeyType<User>`. An `import type` is erased at
   * emit, so adding one cannot change runtime behaviour.
   * @param name - identifier the generated code will use as a type
   * @param location - node the reference will appear at, for scope lookup
   * @param via - names the file already imports whose module may export `name`
   * @returns true when the name is, or will be, available as a type
   */
  ensureType(name: string, location: unknown, via: string[] = []): boolean {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
    if (this.importOf(name)) return true;
    if (this.ctx.checker.resolveName(name, SymbolFlags.Type, location as never)) return true;
    for (const hint of via) {
      const hinted = this.importOf(hint);
      if (!hinted || !this.moduleExports(hinted.declaration, name, SymbolFlags.Type)) continue;
      const text = `import type { ${name} } from ${this.ctx.textOf(this.sf, hinted.declaration.moduleSpecifier)};\n`;
      this.edits.set(`type:${name}`, { start: 0, end: 0, text, source: this.source });
      return true;
    }
    return false;
  }

  /**
   * The edits accumulated so far.
   * @returns promotions and additions, in a stable order
   */
  collect(): Edit[] {
    return [...this.edits.values()];
  }

  /**
   * Snapshot the pending edits, so a property rejected by a later check does
   * not leave an import behind for code that was never generated.
   * @returns a function restoring the snapshot
   */
  checkpoint(): () => void {
    const saved = new Map(this.edits);
    return () => {
      this.edits.clear();
      for (const [key, edit] of saved) this.edits.set(key, edit);
    };
  }

  /**
   * Find the import binding a name, if any.
   * @param name - the local name
   * @returns the declaration, the element, and whether it is type-only
   */
  private importOf(name: string): ImportBinding | undefined {
    for (const statement of this.sf.statements) {
      if (!is.isImportDeclaration(statement)) continue;
      const declaration = statement as any;
      const clause = declaration.importClause;
      if (!clause) continue;
      if (clause.name?.text === name) {
        return { declaration, clause, element: undefined, typeOnly: !!clause.isTypeOnly };
      }
      for (const element of clause.namedBindings?.elements ?? []) {
        if (element.name?.text !== name) continue;
        return { declaration, clause, element, typeOnly: !!(clause.isTypeOnly || element.isTypeOnly) };
      }
    }
    return undefined;
  }

  /**
   * Turn a type-only import of a name into a value import.
   *
   * `import { type X }` loses its inline `type`. `import type { X, Y }` loses
   * the declaration-level one, which makes Y a value import too — harmless
   * without `verbatimModuleSyntax`, since an unused or type-only value import
   * is still elided.
   * @param binding - the import to promote
   */
  private promote(binding: ImportBinding): void {
    if (binding.element?.isTypeOnly) {
      const start = binding.element.getStart();
      const match = /^type\s+/.exec(this.sf.text.slice(start, binding.element.end));
      if (match) this.addRemoval(start, match[0].length);
    }
    if (binding.clause.isTypeOnly) {
      const start = binding.declaration.getStart();
      const match = /^import(\s+)type\s+/.exec(this.sf.text.slice(start, binding.declaration.end));
      if (match)
        this.addRemoval(start + "import".length + match[1].length, match[0].length - "import".length - match[1].length);
    }
  }

  /**
   * Record a deletion keyed by position, so repeated promotions collapse.
   * @param start - offset of the text to remove
   * @param length - characters to remove
   */
  private addRemoval(start: number, length: number): void {
    this.edits.set(`promote:${start}`, { start, end: start + length, text: "", source: this.source });
  }

  /**
   * Whether the module an import declaration names exports `name` as a value.
   * @param declaration - an import declaration in this file
   * @param name - the export to look for
   * @returns true when the module exports a value by that name
   */
  private moduleExportsValue(declaration: any, name: string): boolean {
    return this.moduleExports(declaration, name, SymbolFlags.Value);
  }

  /**
   * Whether the module an import declaration names exports `name` with a meaning.
   * @param declaration - an import declaration in this file
   * @param name - the export to look for
   * @param meaning - `Value` or `Type`
   * @returns true when the module exports `name` with that meaning
   */
  private moduleExports(declaration: any, name: string, meaning: SymbolFlags): boolean {
    const moduleSymbol = this.ctx.checker.getSymbolAtLocation(declaration.moduleSpecifier);
    if (!moduleSymbol) return false;
    const exported = this.ctx.checker.getExportsOfModule(moduleSymbol).find(symbol => symbol.name === name);
    if (!exported) return false;
    const target = exported.flags & SymbolFlags.Alias ? this.ctx.checker.getAliasedSymbol(exported) : exported;
    return (target.flags & meaning) !== 0;
  }
}

/** One import binding, with enough of its syntax to rewrite it. */
interface ImportBinding {
  declaration: any;
  clause: any;
  element: any | undefined;
  typeOnly: boolean;
}
