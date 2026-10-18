import type { JSONSchema7 } from "json-schema";
import type { SdkManifest, SdkManifestModel, SdkManifestOperation } from "../manifest.js";
import { docComment, propertyKey, quote } from "./naming.js";
import { actionBodyType, outputType, type GeneratorNames } from "./operations.js";

/**
 * @param name - a method or attribute name
 * @returns the PascalCase action name of the operation id
 */
function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * @param manifest - the manifest
 * @param model - the model
 * @param names - the names
 * @returns the relation attributes with their generated types
 */
export function relationTypes(
  manifest: SdkManifest,
  model: SdkManifestModel,
  names: GeneratorNames
): Array<{ attribute: string; type: string }> {
  const schema = manifest.schemas[model.schema];
  const typeName = names.types.get(model.schema);
  const target = (id: string) => names.models.get(id) ?? "SdkModel";
  const result: Array<{ attribute: string; type: string }> = [];
  const { relations } = model;
  if (relations.parent) {
    result.push({ attribute: relations.parent.attribute, type: `Link<${target(relations.parent.model)}>` });
  }
  for (const link of relations.links ?? []) {
    const declared =
      typeName && schema?.properties?.[link.attribute] ? `T.${typeName}[${quote(link.attribute)}]` : undefined;
    switch (link.type) {
      case "LINK":
        result.push({ attribute: link.attribute, type: `Link<${target(link.model)}>` });
        break;
      case "LINKS_SIMPLE_ARRAY":
        result.push({ attribute: link.attribute, type: `Links<${target(link.model)}>` });
        break;
      case "LINKS_ARRAY":
        result.push({
          attribute: link.attribute,
          type: `LinksArray<${target(link.model)}, ${declared ? `Omit<NonNullable<${declared}>[number], "uuid">` : "object"}>`
        });
        break;
      case "LINKS_MAP":
        result.push({
          attribute: link.attribute,
          type: `LinksMap<${target(link.model)}, ${declared ? `Omit<NonNullable<${declared}>[string], "uuid">` : "object"}>`
        });
        break;
    }
  }
  for (const query of relations.queries ?? []) {
    result.push({ attribute: query.attribute, type: `Related<${target(query.model)}>` });
  }
  return result;
}

/**
 * @param schema - the model schema
 * @returns the attributes revived as `Date`
 */
function dateTypes(schema: JSONSchema7 | undefined): string[] {
  return Object.entries(schema?.properties ?? {})
    .filter(([, prop]) => typeof prop === "object" && (prop.format === "date-time" || prop.format === "date"))
    .map(([name]) => name);
}

/**
 * The generated methods of a model client: one per custom action and behavior action
 * @param manifest - the manifest
 * @param model - the model
 * @param names - the names
 * @returns the method sources
 */
function clientMethods(manifest: SdkManifest, model: SdkManifestModel, names: GeneratorNames): string[] {
  const methods: string[] = [];
  const operations = model.operations.map(id => manifest.operations[id]).filter(Boolean);
  const used = new Set<string>([
    "get",
    "ref",
    "query",
    "iterate",
    "create",
    "update",
    "patch",
    "delete",
    "action",
    "behavior",
    "hydrate",
    "uid",
    "pkInput",
    "keys",
    "queryFn",
    "on",
    "off",
    "emit",
    "id",
    "client",
    "descriptor",
    "modelClass",
    "backend"
  ]);
  for (const op of operations) {
    if (op.kind !== "action" || !op.action) continue;
    const name = used.has(op.action.name) ? `${op.action.name}Action` : op.action.name;
    used.add(name);
    const body = actionBodyType(manifest, op, names);
    const output = outputType(manifest, op, names);
    const doc = docComment(
      [op.summary, op.description].filter(Boolean).join("\n") || `${capitalize(op.action.name)} action`,
      "  "
    );
    const input = body ? `input: ${body}` : "input: Record<string, unknown> = {}";
    if (op.action.global) {
      methods.push(
        `${doc}  ${name}(${input}, options?: CallOptions): Promise<${output}> {\n    return this.action<${output}>(${quote(op.action.name)}, undefined, input, options);\n  }`
      );
    } else {
      methods.push(
        `${doc}  ${name}(pk: PrimaryKeyInput, ${input}, options?: CallOptions): Promise<${output}> {\n    return this.action<${output}>(${quote(op.action.name)}, pk, input, options);\n  }`
      );
    }
  }
  const behaviors = new Map<string, SdkManifestOperation[]>();
  for (const op of operations) {
    if (op.kind !== "behavior" || !op.behavior) continue;
    behaviors.set(op.behavior.attribute, [...(behaviors.get(op.behavior.attribute) ?? []), op]);
  }
  for (const [attribute, ops] of behaviors) {
    const name = used.has(attribute) ? `${attribute}Behavior` : attribute;
    used.add(name);
    const entries = ops.map(op => {
      const output = outputType(manifest, op, names);
      const inputRef =
        op.input !== "void" && op.input !== "uuidRequest" ? names.types.get(op.input.replace(/\?$/, "")) : undefined;
      const input = inputRef ? `input: T.${inputRef}` : "input: Record<string, unknown> = {}";
      return `    ${docComment(op.summary, "    ").trim()}\n    ${propertyKey(op.behavior!.action)}: (pk: PrimaryKeyInput, ${input}, options?: CallOptions): Promise<${output}> =>\n      this.behavior<${output}>(${quote(attribute)}, ${quote(op.behavior!.action)}, pk, input, options)`;
    });
    methods.push(`  /** Actions of the ${attribute} behavior */\n  readonly ${name} = {\n${entries.join(",\n")}\n  };`);
  }
  return methods;
}

/**
 * Generate `models.ts`: a class per model with its relations, `@Shared` methods, and a `ModelClient` per model
 * @param manifest - the manifest
 * @param names - the names
 * @returns the file content
 */
export function generateModels(manifest: SdkManifest, names: GeneratorNames): string {
  const lines: string[] = [];
  lines.push("/* eslint-disable */");
  lines.push("// Generated by @webda/sdk from the application models: do not edit");
  lines.push("");
  lines.push(
    `import { Link, Links, LinksArray, LinksMap, ModelClient, Related, SdkModel, type CallOptions, type PrimaryKeyInput, type WebdaClient } from ${quote(names.clientModule)};`
  );
  lines.push(`import type * as T from "./types.js";`);
  lines.push(`import { MODELS } from "./operations.js";`);
  // Allowlisted imports of the shared methods
  const imports = new Map<string, Set<string>>();
  for (const model of Object.values(manifest.models)) {
    for (const method of Object.values(model.shared)) {
      for (const [module, identifiers] of Object.entries(method.imports ?? {})) {
        if (!imports.has(module)) imports.set(module, new Set());
        for (const identifier of identifiers) imports.get(module)!.add(identifier);
      }
    }
  }
  for (const [module, identifiers] of [...imports].sort()) {
    lines.push(`import { ${[...identifiers].sort().join(", ")} } from ${quote(module)};`);
  }
  lines.push("");
  for (const model of Object.values(manifest.models)) {
    const className = names.models.get(model.id)!;
    const typeName = names.types.get(model.schema);
    const dataType = typeName ? `T.${typeName}` : "Record<string, unknown>";
    const relations = relationTypes(manifest, model, names);
    const dates = dateTypes(manifest.schemas[model.schema]);
    const overridden = [...relations.map(r => r.attribute), ...dates];
    const description = (manifest.schemas[model.schema] as JSONSchema7 | undefined)?.description;
    lines.push(docComment(`${description ? `${description}\n\n` : ""}${model.id}`).trimEnd());
    lines.push(
      overridden.length
        ? `export interface ${className} extends Omit<${dataType}, ${overridden.map(quote).join(" | ")}> {}`
        : `export interface ${className} extends ${dataType} {}`
    );
    lines.push(`export class ${className} extends SdkModel<${dataType}> {`);
    for (const { attribute, type } of relations) lines.push(`  declare ${propertyKey(attribute)}: ${type};`);
    for (const attribute of dates) lines.push(`  declare ${propertyKey(attribute)}: Date;`);
    for (const [name, method] of Object.entries(model.shared)) {
      lines.push("");
      lines.push(`  /** @Shared ${name} */`);
      lines.push(
        method.source
          .split("\n")
          .map(line => `  ${line}`)
          .join("\n")
      );
    }
    lines.push("}");
    lines.push("");
    lines.push(`/** Client of ${model.id} */`);
    lines.push(`export class ${className}Client extends ModelClient<${className}> {`);
    lines.push("  /**");
    lines.push("   * @param client - the client");
    lines.push("   */");
    lines.push(`  constructor(client: WebdaClient<any>) {`);
    lines.push(`    super(client, MODELS[${quote(model.id)}], ${className});`);
    lines.push("  }");
    for (const method of clientMethods(manifest, model, names)) {
      lines.push("");
      lines.push(method);
    }
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}
