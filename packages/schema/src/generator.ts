import ts from "typescript";
import path, { join } from "path";
import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";


export interface GenerateSchemaOptions {
    project?: string; // path to tsconfig directory or tsconfig file
    file?: string; // file that contains the target type (optional)
    maxDepth?: number; // maximum recursion depth
    asRef?: boolean; // generate schema with $ref instead of inline definitions
    log?: (...args: any[]) => void; // logging function
    program?: ts.Program; // existing TS Program to use
}

const Annotations = {
    dollarPrefixed: ["id", "comment", "ref"],
    boolean: ["deprecated", "readOnly", "writeOnly", "exclusiveMinimum", "exclusiveMaximum"],
    string: [
        "title",
        "description",
        "id",

        "format",
        "pattern",
        "ref",

        // New since draft-07:
        "comment",
        "contentMediaType",
        "contentEncoding",
        // Custom tag for if-then-else support.
        "discriminator",
        "markdownDescription",
        "deprecationMessage",
    ],
    json: [
        "minimum",
        "exclusiveMinimum",

        "maximum",
        "exclusiveMaximum",

        "multipleOf",

        "minLength",
        "maxLength",

        "minProperties",
        "maxProperties",

        "minItems",
        "maxItems",
        "uniqueItems",

        "propertyNames",
        "contains",
        "const",
        "examples",

        "default",

        "required",

        // New since draft-07:
        "if",
        "then",
        "else",
        "readOnly",
        "writeOnly",

        // New since draft 2019-09:
        "deprecated",
    ]
}

export class SchemaGenerator {
    program: ts.Program;
    checker: ts.TypeChecker;
    targetNode!: ts.Node | undefined;
    targetSymbol!: ts.Symbol | undefined;
    targetType!: ts.Type;
    currentOptions: Required<Pick<GenerateSchemaOptions, 'maxDepth' | 'asRef' | 'log'>> = {
        maxDepth: 10,
        asRef: false,
        log: console.log
    };
    currentDefinitions: { [key: string]: JSONSchema7 } = {};

    constructor(private readonly options: GenerateSchemaOptions = {}) {
        if (options.program && options.project) {
            throw new Error('Cannot specify both program and project in SchemaGenerator options');
        }
        options.maxDepth ??= 10;
        options.project ??= options.program ? options.program.getCurrentDirectory() :process.cwd();
        if (options.project) {
            this.program = this.createLanguageService(this.options.project!).getProgram()!;
        } else {
            this.program = options.program!;
        }
        if (!this.program) throw new Error('Failed to create TypeScript Program');
        this.checker = this.program.getTypeChecker();
    }


    // Create a Language Service for the given project
    createLanguageService(projectPath: string) {
        let configFilePath = projectPath;
        const sys = ts.sys;

        if (sys.directoryExists(projectPath)) {
            // If a directory, assume tsconfig.json inside
            const found = ts.findConfigFile(projectPath, sys.fileExists, 'tsconfig.json');
            if (!found) {
                throw new Error(`Could not find tsconfig.json in directory: ${projectPath}`);
            }
            configFilePath = found; // now guaranteed string
        }

        const configFile = ts.readConfigFile(configFilePath, sys.readFile);
        if (configFile.error) {
            throw new Error(ts.formatDiagnosticsWithColorAndContext([configFile.error], {
                getCurrentDirectory: sys.getCurrentDirectory,
                getCanonicalFileName: f => f,
                getNewLine: () => sys.newLine
            }));
        }

        const parseConfigHost: ts.ParseConfigHost = {
            useCaseSensitiveFileNames: sys.useCaseSensitiveFileNames,
            fileExists: sys.fileExists,
            readDirectory: sys.readDirectory,
            readFile: sys.readFile
        };

        const parsed = ts.parseJsonConfigFileContent(configFile.config, parseConfigHost, sys.getCurrentDirectory());
        const files = new Map<string, { version: number; text: string }>();

        function ensureFile(fileName: string) {
            if (!files.has(fileName)) {
                const text = sys.readFile(fileName) || '';
                files.set(fileName, { version: 0, text });
            }
        }

        parsed.fileNames.forEach(ensureFile);

        const servicesHost: ts.LanguageServiceHost = {
            getScriptFileNames: () => Array.from(files.keys()),
            getScriptVersion: (fileName) => files.get(fileName)?.version.toString() || '0',
            getScriptSnapshot: (fileName) => {
                ensureFile(fileName);
                const file = files.get(fileName);
                if (!file) return undefined;
                return ts.ScriptSnapshot.fromString(file.text);
            },
            getCurrentDirectory: () => sys.getCurrentDirectory(),
            getCompilationSettings: () => parsed.options,
            getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
            fileExists: sys.fileExists,
            readFile: sys.readFile,
            readDirectory: sys.readDirectory,
        };

        return ts.createLanguageService(servicesHost, ts.createDocumentRegistry());
    }

    processJsDoc(definition: JSONSchema7, prop?: ts.Symbol) {
        if (!prop) return;
        const jsDoc = this.getJsDocForSymbol(prop, this.checker);
        if (jsDoc.comment) {
            (definition as any)["description"] = jsDoc.comment;
        }
        jsDoc.tags?.filter(t => Annotations.string.includes(t.name)).forEach(t => {
            // Process comment tags if needed
            (definition as any)[Annotations.dollarPrefixed.includes(t.name) ? "$" + t.name : t.name] = t.text;
        });
        jsDoc.tags.filter(t => Annotations.boolean.includes(t.name)).forEach(t => {
            (definition as any)[t.name] = true;
        });
        jsDoc.tags?.filter(t => !Annotations.boolean.includes(t.name) && !Annotations.string.includes(t.name)).forEach(t => {
            let value;
            try {
                value = JSON.parse(t.text);
            } catch {
                value = t.text;
                if (value === "") {
                    value = true;
                }
            }
            // Process comment tags if needed
            if ((definition as any)[t.name] && !Array.isArray((definition as any)[t.name])) {
                (definition as any)[t.name] = [(definition as any)[t.name]];
                (definition as any)[t.name].push(value);
            } else if (Array.isArray((definition as any)[t.name])) {
                // Already an array add more value
                (definition as any)[t.name].push(value);
            } else {
                // First time seen
                (definition as any)[t.name] = value;
            }
        });
    }

    /**
     * Get definition code
     * @param typeName 
     * @returns 
     */
    getDefinitionKey(typeName: string): string {
        return encodeURIComponent(typeName);
    }
    /**
     * Processes a class or interface type and fills in the given definition object.
     * @param type 
     * @param definition 
     * @param path 
     * @param propTypeString 
     */
    processClassOrInterface(type: ts.Type, definition: JSONSchema7, path: string, propTypeString: string) {
        definition.type = 'object';
        const stringIndexType = this.checker.getIndexTypeOfType(
            type,
            ts.IndexKind.String
        );

        if (stringIndexType) {
            // { [key: string]: T } => additionalProperties: <schema of T>
            const indexSchema: JSONSchema7 = {};
            const indexPath = join(path, '[key: string]');
            this.schemaProperty(stringIndexType, indexSchema, indexPath);
            definition.additionalProperties = indexSchema;
        } else {
            // No string index signature: disallow extra properties
            definition.additionalProperties = false;
        }
        this.currentOptions.log?.(`Processing class/interface at ${path}: ${propTypeString}`);

        for (const prop of this.checker.getPropertiesOfType(type)) {
            // Check if property is public
            const decl = prop.valueDeclaration || prop.declarations?.[0];
            if (!decl) continue;

            const flags = ts.getCombinedModifierFlags(decl);

            const isPrivate = (flags & ts.ModifierFlags.Private) !== 0;
            const isProtected = (flags & ts.ModifierFlags.Protected) !== 0;

            if (isPrivate || isProtected) {
                continue; // skip non-public properties
            }

            // Ignore methods
            if (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl) || ts.isFunctionTypeNode(decl)) {
                // TODO Compatibility mode to include methods as $comment
                continue;
            }
            // Check for accessor declarations (get/set)
            if (ts.isGetAccessorDeclaration(decl) || ts.isSetAccessorDeclaration(decl)) {
                // TODO Add a support to export getter as property or setter parameter as property
                continue;
            }

            // Process property
            const propType = this.checker.getTypeOfSymbolAtLocation(prop, this.targetNode!);
            const propSchema: JSONSchema7 & Record<string, any>  = {};
            const propPath = join(path, prop.name);
            const propResult = this.schemaProperty(propType, propSchema, propPath);
            definition.properties ??= {};
            this.processJsDoc(propSchema, prop);
            if (propSchema.hasOwnProperty('param')) {
                delete propSchema.param;
            }
            definition.properties[prop.name] = propSchema;
            this.currentOptions.log?.(`Processed property at ${propPath}: ${decl.initializer ? 'has initializer' : 'no initializer'}`);
            // Check if property have an initializer
            if (decl.initializer) {
                // Property has an initializer
                propResult.optional = true;

                propSchema.default = this.tryGetNonNumericEnumLiteral(decl.initializer)?.const ?? undefined;
            }
            if (!propResult.optional) {
                definition.required ??= [];
                definition.required.push(prop.name);
            }
            
        }
        definition.required?.sort();
        this.currentDefinitions[propTypeString] = { ...definition };
        Object.keys(definition).forEach(key => {
            delete (definition as any)[key];
        });
        definition.$ref = `#/definitions/${this.getDefinitionKey(propTypeString)}`;
    }

    tryGetNonNumericEnumLiteral(expr: ts.Expression): { type: JSONSchema7TypeName, const: boolean | null | string } | undefined {
        // TS 4.8+: this removes casts, parens, etc.
        const inner = ts.skipOuterExpressions
            ? ts.skipOuterExpressions(expr)
            : this.skipOuterExpressionsManual(expr);

        switch (inner.kind) {
            case ts.SyntaxKind.TrueKeyword:
                return {
                    type: "boolean",
                    const: true
                };
            case ts.SyntaxKind.FalseKeyword:
                return {
                    type: "boolean",
                    const: false
                };
            case ts.SyntaxKind.NullKeyword:
                return {
                    type: "null",
                    const: null
                };
            case ts.SyntaxKind.StringLiteral:
                return {
                    type: "string",
                    const: (inner as ts.StringLiteral).text
                };
            default:
                return undefined;
        }
    }

    skipOuterExpressionsManual(expr: ts.Expression): ts.Expression {
        while (
            ts.isParenthesizedExpression(expr) ||
            ts.isAsExpression(expr) ||
            ts.isTypeAssertionExpression(expr)
        ) {
            expr = (expr as ts.ParenthesizedExpression | ts.AsExpression | ts.TypeAssertion).expression;
        }
        return expr;
    }

    processCallableType(sigs: readonly ts.Signature[], definition: JSONSchema7, callName: string, path: string): string {
        definition.type = 'object';
        definition.additionalProperties = false;
        this.currentOptions.log?.(`Processing callable type at ${path}: ${callName}`);
        // getCallSignatures works on function types, not declarations

        definition.properties = {};
        definition.required = [];
        sigs.forEach(sig => {
            sig.getParameters().forEach(param => {
                const paramDecl = param.valueDeclaration as ts.ParameterDeclaration;
                const paramType = this.checker.getTypeOfSymbolAtLocation(param, sig.declaration!);
                const paramSchema: JSONSchema7 = {};
                const paramPath = join(path, `parameter:${param.getName()}`);
                const paramResult = this.schemaProperty(paramType, paramSchema, paramPath);
                this.processJsDoc(paramSchema, param);
                definition.properties![param.getName()] = paramSchema;
                // Check if parameter is optional
                // A parameter is optional if it has a question token or if its type includes undefined or if it has an initializer
                const hasQuestion = !!paramDecl.questionToken;
                const hasInitializer = !!paramDecl.initializer;

                const isOptional = hasQuestion || hasInitializer || paramResult.optional;

                if (!isOptional) {
                    definition.required!.push(param.getName());
                }
            });
        })
        if (definition.required.length === 0) {
            delete definition.required;
        } else {
            definition.required.sort();
        }
        if (definition.properties && Object.keys(definition.properties || {}).length === 0) {
            delete definition.properties;
        }

        const defKey = `NamedParameters<typeof ${callName}>`;
        this.currentDefinitions[defKey] = { ...definition };
        Object.keys(definition).forEach(key => {
            delete (definition as any)[key];
        });
        definition.$ref = `#/definitions/${this.getDefinitionKey(defKey)}`;
        return defKey;
    }

    schemaProperty(type: ts.Type, definition: JSONSchema7, path: string, node?: ts.Node): { optional: boolean, rename?: string } {
        const propTypeString = this.checker.typeToString(type);
        // Count the number of / in path for indentation
        const indent = ' '.repeat((path.match(/\//g) || []).length);
        // Stop at max depth
        if (indent.length > this.currentOptions.maxDepth) {
            return { optional: false };
        }
        this.currentOptions.log(`${indent}Processing property at ${path}: ${propTypeString} (${type.flags})`);
        this.processJsDoc(definition, type.getSymbol());
        const result: {optional: boolean ,rename?: string} = { optional: false };
        const f = type.flags;
        // Implementation to fill in schema for a single property
        if (f & ts.TypeFlags.StringLiteral) {
            definition.type = 'string';
            definition.const = (type as ts.StringLiteralType).value;
        } else if (f & ts.TypeFlags.String) {
            definition.type = 'string';
        } else if (f & ts.TypeFlags.NumberLiteral) {
            definition.type = 'number';
            definition.const = (type as ts.NumberLiteralType).value;
        } else if (f & ts.TypeFlags.BigIntLiteral) {
            definition.type = 'number';
            // TODO How to map BigInt literal to JSON Schema?
        } else if (f & ts.TypeFlags.NumberLike) {
            definition.type = 'number';
        } else if (f & ts.TypeFlags.BooleanLiteral) {
            definition.type = 'boolean';
            definition.const = (type as any).intrinsicName === "true";
        } else if (f & ts.TypeFlags.BooleanLike) {
            definition.type = 'boolean';
        } else if (f & ts.TypeFlags.BigIntLike) {
            definition.type = 'integer';
        } else if (f & ts.TypeFlags.Null) {
            definition.type = 'null';
        } else if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Void) {
            definition.not = {}; // JSON Schema uses 'null' type
            return {
                optional: true
            }
        } else if (f & ts.TypeFlags.Never) {
            definition.not = {}; // matches nothing
        } else if (propTypeString === 'RegExp' || (type.getSymbol() && type.getSymbol()!.getName() === 'RegExp')) {
            // Represent RegExp objects as strings with a custom format. JSON Schema draft-07 does not
            // define a standard format for regex objects, but downstream consumers can interpret
            // `format: "regex"` appropriately. The actual pattern value of a literal /foo/ is not
            // available from the type alone here.
            definition.type = 'string';
            (definition as any).format = 'regex';
        } else if (propTypeString === 'Date' || (type.getSymbol() && type.getSymbol()!.getName() === 'Date')) {
            // Represent Date objects as strings with a custom format. JSON Schema draft-07 does not
            // define a standard format for date objects, but downstream consumers can interpret
            // `format: "date-time"` appropriately. The actual value of a Date is not
            // available from the type alone here.
            definition.type = 'string';
            this.processJsDoc(definition, type.getSymbol());
            delete definition.description; // remove description added from type symbol
            if (!(definition as any).format) {
                (definition as any).format = 'date-time';
            }
        } else if (f & ts.TypeFlags.Any || f & ts.TypeFlags.Unknown) {
            // Type might be defined by its initializer
            if (node) {
                if (ts.isVariableDeclaration(node)) {
                    const initializer = node.initializer;
                    if (initializer) {
                        const initType = this.checker.getTypeAtLocation(initializer);
                        this.currentOptions.log?.(`${indent}Type is any/unknown at ${path}, trying initializer type: ${this.checker.typeToString(initType)}`);
                        return this.schemaProperty(initType, definition, path, node);
                    }
                } else if (ts.isFunctionDeclaration(node)) {
                    definition.additionalProperties = false;
                    definition.type = 'object';
                    // getCallSignatures works on function types, not declarations
                    const sigs = this.checker.getSignaturesOfType(
                        this.checker.getTypeAtLocation(node),
                        ts.SignatureKind.Call
                    );
                    result.rename = this.processCallableType(sigs, definition, this.getFunctionName(node), path);
                    return result;
                }
            }
            // leave type open
            this.currentOptions.log?.(`${indent}Type is any/unknown at ${path}, leaving schema open`);
        } else if (type.isClassOrInterface()) {
            this.processClassOrInterface(type, definition, path, propTypeString);
        } else if (type.isUnion()) {
            // Handle union types
            definition.anyOf = [];
            let lastValue: number = -1;
            const unionDecl = type.getSymbol()?.valueDeclaration;
            const isEnum = unionDecl ? ts.isEnumDeclaration(unionDecl) : false;
            let i = 0;
            for (const subType of type.types) {
                i++;
                // If undefined is part of the union, mark as optional
                if (subType.flags & ts.TypeFlags.Undefined) {
                    result.optional = true;
                    continue; // skip adding undefined to anyOf
                }
                const subSchema: JSONSchema7 = {};
                const subPath = `${path}#${i}`;
                const subResult = this.schemaProperty(subType, subSchema, subPath);

                const decl = subType.getSymbol()?.valueDeclaration || subType.getSymbol()?.declarations?.[0];
                const initializer = decl?.initializer;

                if (initializer) {
                    // Try to get a constant value
                    const constant = initializer
                        ? this.checker.getConstantValue(decl)
                        : undefined;
                    if (constant !== undefined) {
                        this.currentOptions.log?.(`${indent}Union branch at ${subPath} has constant value: ${constant}`);
                        subSchema.const = constant;
                        if (isEnum) {
                            if (typeof constant === 'number') {
                                lastValue = constant;
                            } else {
                                lastValue = -2;
                            }
                        }
                        // Remove type if it matches the const type
                    } else {
                        if (isEnum) {
                            lastValue = -2; // disable auto-increment from now on
                        }

                        // Optional: try to detect boolean/null literal
                        const literal = this.tryGetNonNumericEnumLiteral(initializer);
                        if (literal !== undefined) {
                            subSchema.const = literal.const;
                            subSchema.type = literal.type;
                        }
                    }
                } else if (isEnum && lastValue !== -2) {
                    lastValue = (lastValue ?? 0) + 1;
                    subSchema.const = lastValue;
                }
                this.currentOptions.log?.(`${indent}Union branch at ${subPath}: ${subResult.optional ? 'optional' : 'required'}`);
                definition.anyOf.push(subSchema);
            }
            this.currentOptions.log?.(`${indent}Union (${isEnum}) at ${path} has ${JSON.stringify(definition.anyOf)} branches`);
            definition.anyOf.filter(s => s.type === "null").forEach(s => {
                s.const = null;
            });
            if (definition.anyOf.length === 0) {
                delete definition.anyOf;
            } else if (definition.anyOf.length === 1) {
                Object.assign(definition, definition.anyOf[0]);
                delete definition.anyOf;
            } else if (definition.anyOf.filter((s: any) => s.const !== undefined).length === definition.anyOf.length) {
                definition.enum = definition.anyOf.map((s: any) => s.const);
                definition.type = [...new Set(definition.anyOf.map((s: any) => s.type))];
                if (definition.type.length === 1) {
                    definition.type = definition.type[0];
                }
                delete definition.anyOf;
                this.enumOptimizer(definition);
            }
            // If only "type" in anyOf entries, merge into single type array
            else if (definition.anyOf.every((s: any) => Object.keys(s).length === 1 && s.type !== undefined)) {
                definition.type = definition.anyOf.map(s => (s as any).type);
                delete definition.anyOf;
            }
            if (definition.anyOf) {
                if (definition.anyOf.find(s => s.type === "boolean" && s.const === true) &&
                    definition.anyOf.find(s => s.type === "boolean" && s.const === false)) {
                    // Simplify true|false to boolean
                    definition.anyOf = definition.anyOf.filter(s => !(s.type === "boolean"));
                    if (definition.anyOf.length === 0) {
                        delete definition.anyOf;
                        definition.type = "boolean";
                    } else {
                        definition.anyOf.push({ type: "boolean" });
                    }
                }
                // Simplify anyOf with only type entries
                if (definition.anyOf.every(s => Object.keys(s).length === 1 && s.type)) {
                    definition.type = definition.anyOf.map(s => (s as any).type);
                    delete definition.anyOf;
                }
            }
        } else if (this.checker.isArrayLikeType(type)) {
            definition.type = 'array';
            // Check if readonly array
            if (this.checker.isTupleType(type)) {
                const items: JSONSchema7[] = [];

                const tupleType = type as ts.TupleType;
                // Peel off the underlying target that holds tuple metadata
                const target = (tupleType as any).target ?? tupleType;
                // elementFlags tells you which elements are rest/optional/etc.
                const elementFlags = (target as any).elementFlags as
                    | readonly ts.ElementFlags[]
                    | undefined;

                // Does the tuple end with a ...rest element?
                const hasRestAtEnd =
                    !!elementFlags &&
                    (elementFlags[elementFlags.length - 1] & ts.ElementFlags.Rest) !== 0;

                const elementTypes = this.checker.getTypeArguments(
                    tupleType as ts.TypeReference
                );
                definition.minItems = elementTypes.length;
                elementTypes.forEach((elType, index) => {
                    const itemSchema: JSONSchema7 = {};
                    const info = this.schemaProperty(elType, itemSchema, `${path}[${index}]`);
                    if (info.optional) {
                        definition.minItems!--;
                    }
                    items.push(itemSchema);
                });
                definition.items = {};
                if (items.filter(i => i.const !== undefined).length === items.length) {
                    definition.items.enum = items.map(i => i.const);
                }
                if (new Set((items as JSONSchema7[]).map(i => (i.type))).size === 1) {
                    definition.items.type = items[0].type;
                }
                if (!hasRestAtEnd) {
                    definition.maxItems = elementTypes.length;
                } else {
                    definition.minItems!--;
                }
                if (target.readonly) {
                    (definition as any).const = definition.items.enum;
                    delete definition.items;
                    delete definition.minItems;
                    delete definition.maxItems;
                }
            } else {
                const elementType = this.getArrayElementType(type)!;
                // mark readonly (readonly T[], ReadonlyArray<T>, readonly [..] tuple)
                definition.items = {};
                this.schemaProperty(elementType, definition.items as JSONSchema7, path + '[]');
            }
        } else if (type.isTypeParameter()) {
            this.currentOptions.log?.(`${indent}Type parameter encountered at ${path}, treating as any`);
        } else if (type.flags & ts.TypeFlags.Object && (type.objectFlags & ts.ObjectFlags.Reference)) {
            // Try to resolve generic type references
            this.processClassOrInterface(type, definition, path, propTypeString);
        } else if (type.flags & ts.TypeFlags.Object && (type.objectFlags & ts.ObjectFlags.Anonymous)) {
            this.currentOptions.log?.(`${indent}Anonymous type at ${path}: ${propTypeString} (${type.flags})`);
            definition.type = 'object';
            // Get the parameters
            const callSignatures = type.getCallSignatures();

            if (callSignatures.length > 0) {
                result.rename = this.processCallableType(callSignatures, definition, this.getFunctionName(node), path);
            } else {
                this.processClassOrInterface(type, definition, path, propTypeString);
                this.currentOptions.log?.(`${indent}Unhandled anonymous object type at ${path}: ${propTypeString} (${type.flags})`);
            }
        } else if (type.flags & ts.TypeFlags.Object) {
            // Detect Mapped Types
            const symbol = type.getSymbol();
            if (symbol && symbol.flags & ts.SymbolFlags.TypeLiteral) {
                this.processClassOrInterface(type, definition, path, propTypeString);
            } else {
                this.currentOptions.log?.(`${indent}Unhandled object type at ${path}: ${propTypeString} (${type.flags})`);
            }
        } else {
            this.currentOptions.log?.(`${indent}Unhandled type at ${path}: ${propTypeString} (${type.flags})`);
        }
        // Add more type handling as needed
        return result;
    }

    enumOptimizer(definition: {enum: (any | undefined)[], type?: JSONSchema7TypeName}) : void {
        // Ensure unique enum values
        definition.enum = Array.from(new Set(definition.enum));
        // Implementation to optimize enums in currentDefinitions
        if (definition.enum.length === 2 && definition.type === 'boolean') {
            // Simplify [true, false] to boolean type
            delete definition.enum;
        }
    }

    getFunctionName(node?: ts.Node): string {
        if (!node) return "AnonymousFunction";
        if (ts.isVariableDeclaration(node) && node.name) {
            return node.name.getText();
        } else if (ts.isFunctionDeclaration(node) && node.name) {
            return node.name.getText();
        } else if (ts.isPropertyDeclaration(node) && node.name) {
            return node.name.getText();
        } else if (ts.isMethodDeclaration(node) && node.name) {
            return node.name.getText();
        } else if (node && node.parent) {
            return this.getFunctionName(node.parent);
        }
        return "AnonymousFunction";
    }

    createSchemaFromNodes(nodes: ts.Node[]): JSONSchema7 {
        const result: JSONSchema7 = {
            $schema: "http://json-schema.org/draft-07/schema#",
        };
        // Implementation to create schema from nodes
        nodes.forEach(node => {
            this.targetNode = node as ts.InterfaceDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration;
            let typeName = this.targetNode!.name!.getText();
            this.targetSymbol = this.checker.getSymbolAtLocation(this.targetNode!.name!);
            this.targetType = this.checker.getDeclaredTypeOfSymbol(this.targetSymbol!);

            const defSchema: JSONSchema7 = {};
            const res = this.schemaProperty(this.targetType, defSchema, "/", this.targetNode);
            if (res.rename) {
                typeName = res.rename;
            }
            result.$ref ??= `#/definitions/${this.getDefinitionKey(typeName)}`;
            result.definitions = {
                ...this.currentDefinitions
            };
            result.definitions[typeName] ??= defSchema;
        });
        if (!this.currentOptions.asRef && result.$ref) {
            // Inline definitions
            Object.assign(result, result.definitions![decodeURI(result.$ref.replace('#/definitions/', ''))]);
            delete result.definitions[result.$ref];
            delete result.$ref;
        }
        // Sort keys alphabetically recursively
        return this.sortKeys(result);
    }

    getSchemaForType(typeName: string, file?: string, options: Partial<SchemaGenerator["currentOptions"]> = {}): JSONSchema7 {
        this.currentOptions = { maxDepth: options.maxDepth ?? this.options.maxDepth ?? 10, asRef: options.asRef ?? this.options.asRef ?? false, log: options.log ?? this.options.log ?? console.log };
        this.currentDefinitions = {};
        this.targetNode = this.find(typeName, file)!;
        if (!this.targetNode) {
            throw new Error(`Type "${typeName}" not found${file ? ` in file "${file}"` : ''}`);
        }
        return this.createSchemaFromNodes([this.targetNode]);
    }

    /**
     * Sort keys of an object recursively
     * @param obj 
     * @returns 
     */
    sortKeys(obj: any): any {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const sorted: any = {};
            Object.keys(obj).sort().forEach(key => {
                sorted[key] = this.sortKeys(obj[key]);
            });
            return sorted;
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.sortKeys(item));
        }
        return obj;
    }

    find(typeName: string, filePath?: string): ts.Node | undefined {
        let targetNode: ts.Node | undefined;
        // Implementation to find the target declaration
        const findTarget = (node: ts.Node) => {
            if (targetNode) return; // already found, skip further work
            // Narrow to named declarations we care about
            this.currentOptions.log?.(`Visiting node: ${node.name?.text || '<anonymous>'} (${ts.SyntaxKind[node.kind]})`);
            if (
                ts.isClassDeclaration(node) ||
                ts.isInterfaceDeclaration(node) ||
                ts.isTypeAliasDeclaration(node) ||
                ts.isFunctionDeclaration(node) ||
                ts.isVariableDeclaration(node) ||
                ts.isEnumDeclaration(node)
            ) {
                const nodeName =
                    node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
                // optional: check exported only
                // const isExported = (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

                if (nodeName === typeName) {
                    targetNode = node;
                    return;
                }
            }
            // Recurse into children
            ts.forEachChild(node, findTarget);
        }
        this.program.getSourceFiles().forEach(file => {
            if (filePath && path.resolve(file.fileName) !== path.resolve(filePath)) {
                return;
            }
            ts.forEachChild(file, findTarget);
        });
        return targetNode;
    }

    getArrayElementType(type: ts.Type): ts.Type | undefined {
        // If this returns something, the type is "array-like" (Array<T>, ReadonlyArray<T>, T[])
        return this.checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? undefined;
    }

    getJsDocForSymbol(prop: ts.Symbol, checker: ts.TypeChecker) {
        const comment = ts.displayPartsToString(
            prop.getDocumentationComment(checker)
        );

        const tags = prop.getJsDocTags().map(tag => ({
            name: tag.name,
            text: ts.displayPartsToString(tag.text ?? []),
        }));

        return { comment, tags };
    }
}