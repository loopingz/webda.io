/**
 * Flows generator: typed calls in `.flow.ts` files.
 *
 * A flow method is never executed: the build compiles its body into a workflow graph (`../flows/compile.ts`). What
 * the author writes still has to type-check, so this generator appends ambient declarations to each `.flow.ts`:
 *
 * - every `@Operation` of the project's services as `<ServiceClass>.<Method>(input, options?)`, the input keyed by
 *   parameter name, the result the method's return type, `Promise` unwrapped;
 * - every method of the file's flow classes as `<FlowClass>.<Method>(input, options?)`, a child flow.
 *
 * Types are written as indexed accesses on the real declarations (`Parameters<import("./x.js").X["m"]>[0]`) rather
 * than printed with `typeToString`, so a named type resolves in the flow file without importing it.
 *
 * The edits are pure insertions at the end of the file: source positions of the authored text never move.
 */
import { dirname, relative } from "node:path";
import type { SourceFile } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import {
  FLOW_SUFFIX,
  flowClassesOf,
  flowMethodsOf,
  hasModifier,
  operationServices,
  type OperationService
} from "../flows/discovery.ts";
import { capitalize, TASK_OPTIONS_TYPE } from "../flows/types.ts";
import type { AnalysisContext, Edit, FileEdits, Generator } from "../plan.ts";

/** Name of the injected task options type. */
const OPTIONS = "__WebdaFlowTaskOptions";

/**
 * Names declared at the top level of a file: an injected declaration must not redeclare one
 * @param sf - the file
 * @returns the names
 */
function topLevelNames(sf: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sf.statements as unknown as any[]) {
    if (is.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name) names.add(clause.name.text);
      const bindings: any = clause?.namedBindings;
      if (bindings?.name) names.add(bindings.name.text);
      for (const element of bindings?.elements ?? []) names.add(element.name.text);
    } else if (is.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations as unknown as any[]) {
        if (is.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else if (statement.name && is.isIdentifier(statement.name)) {
      names.add(statement.name.text);
    }
  }
  return names;
}

/**
 * Module specifier of a source file, relative to a flow file, as `nodenext` resolves it
 * @param from - the flow file
 * @param to - the target source file
 * @returns the specifier
 */
function specifier(from: string, to: string): string {
  let path = relative(dirname(from), to).replace(/\\/g, "/");
  path = path.replace(/\.(m|c)?tsx?$/, (_match, kind) => `.${kind ?? ""}js`);
  return path.startsWith(".") ? path : `./${path}`;
}

/**
 * Declaration of one typed call
 * @param name - the call name
 * @param owner - the type the method belongs to
 * @param method - the method name
 * @param parameters - the input keys
 * @returns the method signature text
 */
function callSignature(
  name: string,
  owner: string,
  method: string,
  parameters: { name: string; index: number; optional: boolean }[]
): string {
  const input = parameters
    .map(p => `${p.name}${p.optional ? "?" : ""}: Parameters<${owner}[${JSON.stringify(method)}]>[${p.index}]`)
    .join("; ");
  return (
    `${name}(input${parameters.every(p => p.optional) ? "?" : ""}: { ${input} }, options?: ${OPTIONS}): ` +
    `Promise<Awaited<ReturnType<${owner}[${JSON.stringify(method)}]>>>;`
  );
}

/**
 * The declarations appended to a flow file
 * @param ctx - analysis context
 * @param sf - the flow file
 * @param services - the project's services
 * @returns the text, empty when there is nothing to declare
 */
export function flowDeclarations(
  ctx: AnalysisContext,
  sf: SourceFile,
  services: Map<string, OperationService | undefined>
): string {
  const taken = topLevelNames(sf);
  const lines: string[] = [];
  for (const service of services.values()) {
    if (!service || taken.has(service.className)) continue;
    const owner = `import(${JSON.stringify(specifier(sf.fileName, service.fileName))}).${service.className}`;
    lines.push(`declare const ${service.className}: {`);
    for (const [name, operation] of service.operations) {
      lines.push(`  ${callSignature(name, owner, operation.method, operation.parameters)}`);
    }
    lines.push(`};`);
  }
  for (const cls of flowClassesOf(ctx, sf)) {
    const className = cls.name!.text;
    const exported = hasModifier(cls, SyntaxKind.ExportKeyword) ? "export " : "";
    lines.push(`${exported}declare namespace ${className} {`);
    for (const method of flowMethodsOf(cls)) {
      const name = (method.name as any).text as string;
      const parameters = (method.parameters as unknown as any[])
        .map((parameter, index) => ({
          name: is.isIdentifier(parameter.name) ? parameter.name.text : "",
          index,
          optional: parameter.questionToken !== undefined || parameter.initializer !== undefined
        }))
        .filter(p => p.name);
      lines.push(`  function ${callSignature(capitalize(name), className, name, parameters)}`);
    }
    lines.push(`}`);
  }
  if (!lines.length) return "";
  return [
    "",
    "",
    "// Generated by @webda/content-mapper: typed flow calls",
    `type ${OPTIONS} = ${TASK_OPTIONS_TYPE};`,
    ...lines,
    ""
  ].join("\n");
}

/**
 * Create the flows generator
 * @returns a generator
 */
export function flowsGenerator(): Generator {
  return {
    name: "flows",
    analyze(ctx: AnalysisContext): FileEdits[] {
      const files = ctx.sourceFiles.filter(sf => sf.fileName.endsWith(FLOW_SUFFIX));
      if (!files.length) return [];
      const services = operationServices(ctx);
      const out: FileEdits[] = [];
      for (const sf of files) {
        const text = flowDeclarations(ctx, sf, services);
        const edits: Edit[] = text ? [{ start: sf.text.length, end: sf.text.length, text, source: "flows" }] : [];
        if (edits.length) out.push({ fileName: sf.fileName, edits });
      }
      return out;
    }
  };
}
