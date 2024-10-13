import {
  AnnotatedNodeParser,
  AnnotatedType,
  ArrayType,
  BaseType,
  ChainNodeParser,
  CircularReferenceNodeParser,
  CompletedConfig,
  Context,
  createFormatter,
  createParser,
  Definition,
  ExtendedAnnotationsReader,
  FunctionType,
  InterfaceAndClassNodeParser,
  LiteralType,
  ObjectProperty,
  ObjectType,
  ReferenceType,
  SchemaGenerator,
  StringType,
  SubNodeParser,
  SubTypeFormatter,
  UnionType
} from "ts-json-schema-generator";
import ts from "typescript";

/**
 * Copy from  https://github.com/vega/ts-json-schema-generator/blob/next/src/Utils/modifiers.ts
 * They are not exported correctly
 */
/**
 * Checks if given node has the given modifier.
 *
 * @param node     - The node to check.
 * @param modifier - The modifier to look for.
 * @return True if node has the modifier, false if not.
 */
export function hasModifier(node: ts.Node, modifier: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && node.modifiers?.some(nodeModifier => nodeModifier.kind === modifier);
}
/**
 * Checks if given node is public. A node is public if it has the public modifier or has no modifiers at all.
 *
 * @param node - The node to check.
 * @return True if node is public, false if not.
 */
export function isPublic(node: ts.Node): boolean {
  return !(hasModifier(node, ts.SyntaxKind.PrivateKeyword) || hasModifier(node, ts.SyntaxKind.ProtectedKeyword));
}

/**
 * Checks if given node has the static modifier.
 *
 * @param node - The node to check.
 * @return True if node is static, false if not.
 */
export function isStatic(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.StaticKeyword);
}

/**
 * Temporary fix while waiting for https://github.com/vega/ts-json-schema-generator/pull/1182
 */
/* c8 ignore start */
export class FunctionTypeFormatter implements SubTypeFormatter {
  public supportsType(type: FunctionType): boolean {
    return type instanceof FunctionType;
  }

  public getDefinition(_type: FunctionType): Definition {
    // Return a custom schema for the function property.
    return {};
  }

  public getChildren(_type: FunctionType): BaseType[] {
    return [];
  }
}

export class NullTypeFormatter implements SubTypeFormatter {
  public supportsType(type: FunctionType): boolean {
    return type === undefined;
  }

  public getDefinition(_type: FunctionType): Definition {
    // Return a custom schema for the function property.
    return {};
  }

  public getChildren(_type: FunctionType): BaseType[] {
    return [];
  }
}

export function hash(a: unknown): string | number {
  if (typeof a === "number") {
    return a;
  }

  const str = typeof a === "string" ? a : JSON.stringify(a);

  // short strings can be used as hash directly, longer strings are hashed to reduce memory usage
  if (str.length < 20) {
    return str;
  }

  // from http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    h = (h << 5) - h + char;
    h = h & h; // Convert to 32bit integer
  }

  // we only want positive integers
  if (h < 0) {
    return -h;
  }

  return h;
}

/**
 * Temporary fix
 */
export class ConstructorNodeParser implements SubNodeParser {
  public supportsNode(node: ts.ConstructorTypeNode): boolean {
    return node.kind === ts.SyntaxKind.ConstructorType;
  }

  public createType(_node: ts.TypeQueryNode, _context: Context, _reference?: ReferenceType): BaseType | undefined {
    return undefined;
  }
}

/* c8 ignore stop */
export class WebdaAnnotatedNodeParser extends AnnotatedNodeParser {
  createType(node: ts.Node, context: Context, reference?: ReferenceType) {
    let type = super.createType(node, context, reference);
    if (node.parent.kind === ts.SyntaxKind.PropertyDeclaration) {
      if ((<ts.PropertyDeclaration>node.parent).name.getText().startsWith("_")) {
        /* c8 ignore next 3 - do not know how to generate this one */
        if (!(type instanceof AnnotatedType)) {
          type = new AnnotatedType(type, { readOnly: true }, false);
        } else {
          type.getAnnotations().readOnly = true;
        }
      }
    }
    return type;
  }
}

export class WebdaModelNodeParser extends InterfaceAndClassNodeParser {
  public supportsNode(node: ts.InterfaceDeclaration | ts.ClassDeclaration): boolean {
    return node.kind === ts.SyntaxKind.ClassDeclaration || node.kind === ts.SyntaxKind.InterfaceDeclaration;
  }

  /**
   * Override to filter __ properties
   * @param node
   * @param context
   * @returns
   */
  protected getProperties(
    node: ts.InterfaceDeclaration | ts.ClassDeclaration,
    context: Context
  ): ObjectProperty[] | undefined {
    let hasRequiredNever = false;
    const properties = (node.members as ts.NodeArray<ts.TypeElement | ts.ClassElement>)
      .reduce(
        (members, member) => {
          if (ts.isConstructorDeclaration(member)) {
            const params = member.parameters.filter(param =>
              ts.isParameterPropertyDeclaration(param, param.parent)
            ) as ts.ParameterPropertyDeclaration[];
            members.push(...params);
          } else if (ts.isPropertySignature(member)) {
            members.push(member);
          } else if (ts.isPropertyDeclaration(member)) {
            // Ensure NotEnumerable is not part of the property annotation
            if (
              !(ts.getDecorators(<ts.PropertyDeclaration>member) || []).find(annotation => {
                return "NotEnumerable" === annotation?.expression?.getText();
              })
            ) {
              members.push(member);
            }
          }
          return members;
        },
        [] as (ts.PropertyDeclaration | ts.PropertySignature | ts.ParameterPropertyDeclaration)[]
      )
      .filter(
        member =>
          isPublic(member) && !isStatic(member) && member.type && !this.getPropertyName(member.name).startsWith("__")
      )
      .map(member => {
        // Check for other tags
        let ignore = false;
        let generated = false;
        const jsDocs = ts.getAllJSDocTags(member, (tag: ts.JSDocTag): tag is ts.JSDocTag => {
          return true;
        });
        jsDocs.forEach(n => {
          if (n.tagName.text === "SchemaIgnore") {
            ignore = true;
          }
          if (n.tagName.text.toLowerCase() === "generated") {
            generated = true;
          }
        });

        if (ignore) {
          return undefined;
        }

        // @ts-ignore
        const typeName = member.type?.typeName?.escapedText;
        let readOnly =
          jsDocs.filter(n => n.tagName.text === "readOnly").length > 0 ||
          this.getPropertyName(member.name).startsWith("_");
        let optional =
          readOnly || member.questionToken || jsDocs.find(n => "SchemaOptional" === n.tagName.text) !== undefined;
        let type;

        if (typeName === "ModelParent" || typeName === "ModelLink") {
          type = new StringType();
        } else if (typeName === "ModelLinksSimpleArray") {
          type = new ArrayType(new StringType());
        } else if (typeName === "ModelLinksArray") {
          const subtype = <any>(
            this.childNodeParser.createType((<ts.NodeWithTypeArguments>member.type).typeArguments[1], context)
          );
          subtype.properties.push(new ObjectProperty("uuid", new StringType(), true));
          type = new ArrayType(subtype);
        } else if (typeName === "ModelLinksMap") {
          const subtype = <any>(
            this.childNodeParser.createType((<ts.NodeWithTypeArguments>member.type).typeArguments[1], context)
          );
          subtype.properties.push(new ObjectProperty("uuid", new StringType(), true));
          type = new ObjectType("modellinksmap-test", [], [], subtype);
        } else if (typeName === "ModelsMapped") {
          const subtype = <any>(
            this.childNodeParser.createType((<ts.NodeWithTypeArguments>member.type).typeArguments[0], context)
          );
          const attrs = this.childNodeParser.createType(
            (<ts.NodeWithTypeArguments>member.type).typeArguments[2],
            context
          );
          const keep = [];
          if (attrs instanceof LiteralType) {
            keep.push(attrs.getValue());
          } else if (attrs instanceof UnionType) {
            attrs
              .getTypes()
              .filter(t => t instanceof LiteralType)
              .forEach((t: LiteralType) => {
                keep.push(t.getValue());
              });
          }
          subtype.properties = (subtype.properties || []).filter(o => keep.includes(o.name));
          subtype.properties.push(new ObjectProperty("uuid", new StringType(), true));
          type = new ArrayType(
            new ObjectType(
              "modelmapped-test",
              [],
              subtype.properties.filter(o => !["get", "set", "toString"].includes(o.name)),
              false
            )
          );
          optional = true;
          readOnly = true;
        } else if (typeName === "ModelRelated") {
          // ModelRelated are only helpers for backend development
          return undefined;
        } else if (typeName === "Binary" || typeName === "Binaries") {
          // Binary and Binaries should be readonly as they are only modifiable by a BinaryService
          optional = true;
          readOnly = true;
          if ((<ts.NodeWithTypeArguments>member.type).typeArguments?.length) {
            type = this.childNodeParser.createType((<ts.NodeWithTypeArguments>member.type).typeArguments[0], context);
          } else {
            type = new ObjectType(typeName + "_" + this.getPropertyName(member.name), [], [], true);
            //type["additionalProperties"] = true;
          }
          if (typeName !== "Binary") {
            type = new ArrayType(type);
          }
          //return new ObjectProperty(this.getPropertyName(member.name), type, false);
        }
        type ??= this.childNodeParser.createType(member.type, context);
        if (readOnly || generated) {
          const annotations = {};
          if (readOnly || generated) {
            annotations["readOnly"] = true;
          }
          if (generated) {
            annotations["$generated"] = true;
            // Generated cannot be required
            optional = true;
          }
          type = new AnnotatedType(type, annotations, false);
        }
        // If property is in readOnly then we do not want to require it
        return new ObjectProperty(this.getPropertyName(member.name), type, !optional);
      })
      .filter(prop => {
        if (!prop) {
          return false;
        }
        if (prop.isRequired() && prop.getType() === undefined) {
          /* c8 ignore next 2 */
          hasRequiredNever = true;
        }
        return prop.getType() !== undefined;
      });

    if (hasRequiredNever) {
      /* c8 ignore next 2 */
      return undefined;
    }

    return properties;
  }
}

export function createSchemaGenerator(program: ts.Program, typeChecker: ts.TypeChecker): SchemaGenerator {
  const config: CompletedConfig = {
    expose: "all",
    encodeRefs: true,
    jsDoc: "extended",
    additionalProperties: true,
    sortProps: true,
    minify: true,
    topRef: true,
    markdownDescription: false,
    strictTuples: true,
    skipTypeCheck: true,
    extraTags: [],
    discriminatorType: "json-schema",
    functions: "comment"
  };
  const extraTags = new Set(["Modda", "Model"]);
  const parser = createParser(program, config, (chainNodeParser: ChainNodeParser) => {
    chainNodeParser.addNodeParser(new ConstructorNodeParser());
    chainNodeParser.addNodeParser(
      new CircularReferenceNodeParser(
        new AnnotatedNodeParser(
          new WebdaModelNodeParser(
            typeChecker,
            new WebdaAnnotatedNodeParser(chainNodeParser, new ExtendedAnnotationsReader(typeChecker, extraTags)),
            true
          ),
          new ExtendedAnnotationsReader(typeChecker, extraTags)
        )
      )
    );
  });
  const formatter = createFormatter(config, (fmt, _circularReferenceTypeFormatter) => {
    // If your formatter DOES NOT support children, e.g. getChildren() { return [] }:
    fmt.addTypeFormatter(new FunctionTypeFormatter());
    fmt.addTypeFormatter(new NullTypeFormatter());
  });
  return new SchemaGenerator(program, parser, formatter, config);
}
