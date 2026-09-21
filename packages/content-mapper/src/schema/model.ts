/**
 * Model schemas — the `Schemas` field of a model entry in
 * `webda.module.json`.
 *
 * Stage 7.2, and the part that needed the accessor read/write distinction.
 * A model is described three times, from three different angles:
 *
 * | schema   | mode       | answers                                  |
 * | -------- | ---------- | ---------------------------------------- |
 * | `Input`  | `dto-in`   | what a client may send                   |
 * | `Output` | `dto-out`  | what the API returns                     |
 * | `Stored` | `output`   | what is persisted                        |
 *
 * Each is taken from an explicit `fromDto` / `toDto` / `toJSON` when the
 * model declares one, and derived from the class shape otherwise. Which of
 * the two applied is recorded in `$webda` and is part of the committed
 * artefact, so it has to be reproduced exactly — see
 * `ModuleGenerator.generateModelSchemas`.
 */
import { SignatureKind } from "typescript/unstable/sync";
import type { Checker, Project, Signature, Type } from "typescript/unstable/sync";
import type { ClassDeclaration, Node } from "typescript/unstable/ast";
import { SchemaConverter } from "./converter.ts";
import type { JSONSchema7 } from "./types.ts";

/** The three views of a model, as recorded in `webda.module.json`. */
export interface ModelSchemas {
  /** What a client may send. */
  Input: JSONSchema7;
  /** What the API returns. */
  Output: JSONSchema7;
  /** What is persisted. */
  Stored: JSONSchema7;
}

/** What is needed to convert a model. */
export interface ModelSchemaOptions {
  /** Project the checker belongs to. */
  project: Project;
  /** The resident checker. */
  checker: Checker;
}

/**
 * Generate a model's Input, Output and Stored schemas.
 * @param declaration - the model class
 * @param options - project and checker
 * @returns the three schemas, each carrying its `$webda` provenance marker
 */
export function generateModelSchemas(declaration: ClassDeclaration, options: ModelSchemaOptions): ModelSchemas {
  const { checker, project } = options;
  const classType = checker.getTypeAtLocation(declaration);

  /**
   * The first call signature of a method on the model, if it declares one.
   * @param name - the method name
   * @returns the signature, when present
   */
  const signatureOf = (name: string): Signature | undefined => {
    const symbol = checker.getApparentType(classType).getProperty(name) ?? classType.getProperty(name);
    if (!symbol) return undefined;
    const methodType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const signatures = checker.getSignaturesOfType(methodType, SignatureKind.Call);
    return signatures.length > 0 ? signatures[0] : undefined;
  };

  /**
   * Convert either an explicit type or the class shape.
   * @param mode - which view to build
   * @param explicit - the declared type, when the model provides one
   * @param marker - the `$webda` value for whichever applied
   * @returns the schema
   */
  const build = (mode: "dto-in" | "dto-out" | "output", explicit: Type | undefined, marker: string): JSONSchema7 => {
    const converter = new SchemaConverter({ project, checker, mode });
    const schema = explicit ? converter.fromType(explicit, declaration) : converter.fromNode(declaration);
    schema.$webda = marker;
    return schema;
  };

  const toDto = signatureOf("toDto");
  const fromDto = signatureOf("fromDto");
  const toJSON = signatureOf("toJSON");

  return {
    Output: build("dto-out", toDto && checker.getReturnTypeOfSignature(toDto), toDto ? "toDto$return" : "toDto$auto"),
    Input: build(
      "dto-in",
      fromDto && firstParameterType(fromDto, declaration, options),
      fromDto ? "fromDto$param" : "fromDto$auto"
    ),
    Stored: build(
      "output",
      toJSON && checker.getReturnTypeOfSignature(toJSON),
      toJSON ? "toJSON$return" : "toJSON$auto"
    )
  };
}

/**
 * The declared type of a signature's first parameter.
 *
 * Read from the declaration rather than the signature where possible: a
 * parameter's contextual type can be narrowed, and the Input schema wants
 * what was written down.
 * @param signature - the signature
 * @param location - fallback resolution context
 * @param options - project and checker
 * @returns the parameter type
 */
function firstParameterType(signature: Signature, location: Node, options: ModelSchemaOptions): Type {
  const parameter = signature.getParameters()[0];
  const declaration =
    parameter?.valueDeclaration?.resolve(options.project) ?? parameter?.declarations[0]?.resolve(options.project);
  if (declaration) return options.checker.getTypeAtLocation(declaration);
  return parameter
    ? options.checker.getTypeOfSymbolAtLocation(parameter, location)
    : options.checker.getParameterType(signature, 0);
}
