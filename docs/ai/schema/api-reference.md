---
sidebar_position: 4
title: API Reference
description: Complete API reference for @webda/schema
---

# API Reference

Complete API documentation for `@webda/schema`.

## SchemaGenerator Class

The main class for generating JSON Schema from TypeScript types.

### Constructor

```typescript
constructor(options?: GenerateSchemaOptions)
```

Creates a new schema generator instance.

**Parameters:**

- `options` - Configuration options (see [GenerateSchemaOptions](#generateschemaoptions))

**Example:**

```typescript
import { SchemaGenerator } from '@webda/schema';

const generator = new SchemaGenerator({
  project: './tsconfig.json',
  log: console.log
});
```

### Methods

#### getSchemaForTypeName()

Generate schema for a named type.

```typescript
getSchemaForTypeName(
  typeName: string,
  file?: string,
  options?: Partial<GeneratorOptions>
): JSONSchema7
```

**Parameters:**

- `typeName` - Name of the type/interface/class to generate schema for
- `file` - Optional file path to restrict type search
- `options` - Additional options to override constructor options

**Returns:** JSONSchema7 object

**Example:**

```typescript
const schema = generator.getSchemaForTypeName('User');

// With file restriction
const schema2 = generator.getSchemaForTypeName(
  'User',
  'src/types/user.ts'
);

// With options override
const schema3 = generator.getSchemaForTypeName('User', undefined, {
  asRef: true,
  log: console.log
});
```

**Throws:** Error if type is not found

---

#### getSchemaFromType()

Generate schema from a TypeScript type object.

```typescript
getSchemaFromType(
  type: ts.Type,
  options?: Partial<GeneratorOptions>
): JSONSchema7
```

**Parameters:**

- `type` - TypeScript Type object from the compiler API
- `options` - Additional options to override constructor options

**Returns:** JSONSchema7 object

**Example:**

```typescript
const program = generator.getProgram();
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile('src/models.ts');

// Find a type node
const node = findTypeNode(sourceFile, 'User');
const type = checker.getTypeAtLocation(node);

// Generate schema
const schema = generator.getSchemaFromType(type);
```

---

#### getSchemaFromNodes()

Generate schema from multiple TypeScript AST nodes.

```typescript
getSchemaFromNodes(
  nodes: ts.Node[],
  options?: Partial<GeneratorOptions>
): JSONSchema7
```

**Parameters:**

- `nodes` - Array of TypeScript AST nodes
- `options` - Additional options to override constructor options

**Returns:** JSONSchema7 object with all types in definitions

**Example:**

```typescript
const sourceFile = program.getSourceFile('src/models.ts');
const nodes = findAllExportedTypes(sourceFile);

const schema = generator.getSchemaFromNodes(nodes);
```

---

#### getProgram()

Get the TypeScript Program instance.

```typescript
getProgram(): ts.Program
```

**Returns:** TypeScript Program object

**Example:**

```typescript
const program = generator.getProgram();
const sourceFiles = program.getSourceFiles();
```

---

#### createLanguageService()

Create a TypeScript language service for a project.

```typescript
createLanguageService(projectPath: string): ts.LanguageService
```

**Parameters:**

- `projectPath` - Path to tsconfig.json or directory containing it

**Returns:** TypeScript LanguageService object

**Example:**

```typescript
const service = generator.createLanguageService('./tsconfig.json');
const program = service.getProgram();
```

---

#### find()

Find a type declaration node by name.

```typescript
find(typeName: string, filePath?: string): ts.Node | undefined
```

**Parameters:**

- `typeName` - Name of the type to find
- `filePath` - Optional file path to restrict search

**Returns:** TypeScript Node if found, undefined otherwise

**Example:**

```typescript
const userNode = generator.find('User');
const productNode = generator.find('Product', 'src/models/product.ts');
```

---

#### processJsDoc()

Process JSDoc comments and apply to schema definition.

```typescript
processJsDoc(
  definition: JSONSchema7,
  prop?: ts.Symbol
): void
```

**Parameters:**

- `definition` - JSON Schema definition to modify
- `prop` - TypeScript Symbol to extract JSDoc from

**Example:**

```typescript
const definition: JSONSchema7 = {};
generator.processJsDoc(definition, typeSymbol);
// definition now includes description, format, etc.
```

---

## Interfaces

### GenerateSchemaOptions

Configuration options for SchemaGenerator constructor.

```typescript
interface GenerateSchemaOptions {
  // Path to tsconfig.json or directory containing it
  project?: string;

  // File that contains the target type (optional filter)
  file?: string;

  // Maximum recursion depth (default: 10)
  maxDepth?: number;

  // Generate schema with $ref definitions instead of inline (default: false)
  asRef?: boolean;

  // Logging function
  log?: (...args: any[]) => void;

  // Existing TypeScript Program to use
  program?: ts.Program;

  // Buffer serialization strategy (default: 'base64')
  bufferStrategy?: 'base64' | 'binary' | 'hex' | 'array';

  // Custom buffer mapper (overrides bufferStrategy)
  mapBuffer?: (
    definition: JSONSchema7,
    ctx: { type: ts.Type; path: string }
  ) => void;

  // Disable boolean default to false behavior (default: false)
  disableBooleanDefaultToFalse?: boolean;

  // Schema type for input/output differentiation (default: 'input')
  type?: 'input' | 'output';

  // Transformer function to modify type during generation
  transformer?: (options: SchemaPropertyArguments) => SchemaPropertyArguments;
}
```

**Example:**

```typescript
const options: GenerateSchemaOptions = {
  project: './tsconfig.json',
  maxDepth: 20,
  asRef: true,
  bufferStrategy: 'hex',
  disableBooleanDefaultToFalse: true,
  type: 'output',
  log: console.log,
  transformer: (opts) => {
    // Transform logic
    return opts;
  }
};

const generator = new SchemaGenerator(options);
```

---

### SchemaPropertyArguments

Arguments passed to transformer function.

```typescript
interface SchemaPropertyArguments {
  // TypeScript type being processed
  type: ts.Type;

  // Current JSON Schema definition being built
  definition: JSONSchema7;

  // Schema path (e.g., "/User/address/street")
  path: string;

  // TypeScript AST node (if available)
  node?: ts.Node;

  // Current recursion depth
  depth: number;
}
```

**Example:**

```typescript
const transformer = (args: SchemaPropertyArguments) => {
  console.log('Processing:', args.path);
  console.log('Depth:', args.depth);
  console.log('Type:', checker.typeToString(args.type));

  // Modify type if needed
  if (args.path.includes('sensitive')) {
    args.type = getSafeType(args.type);
  }

  return args;
};
```

---

### JSONSchema7

TypeScript definition for JSON Schema Draft-07.

```typescript
interface JSONSchema7 {
  $schema?: string;
  $ref?: string;
  $comment?: string;

  // Type
  type?: JSONSchema7TypeName | JSONSchema7TypeName[];

  // Numeric
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // Array
  items?: JSONSchema7Definition | JSONSchema7Definition[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchema7;

  // Object
  properties?: { [key: string]: JSONSchema7Definition };
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;
  minProperties?: number;
  maxProperties?: number;
  propertyNames?: JSONSchema7;

  // Composition
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;

  // Conditional
  if?: JSONSchema7;
  then?: JSONSchema7;
  else?: JSONSchema7;

  // Enums and constants
  enum?: any[];
  const?: any;

  // Metadata
  title?: string;
  description?: string;
  default?: any;
  examples?: any[];
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;

  // Content
  contentMediaType?: string;
  contentEncoding?: string;

  // Definitions
  definitions?: { [key: string]: JSONSchema7 };
}
```

---

## CLI Command

### webda-schema-generator

Command-line tool for schema generation.

```bash
webda-schema-generator [options]
```

**Options:**

| Option | Description | Required |
|--------|-------------|----------|
| `--type <name>` | Type/interface/class name | Yes |
| `--file <path>` | TypeScript file containing the type | No |
| `--project <path>` | Path to tsconfig.json or directory | No |
| `--out <file>` | Output file path | No |
| `--pretty` | Pretty-print JSON output | No |
| `--help` | Show help | No |

**Examples:**

```bash
# Basic usage
webda-schema-generator --type User

# With file
webda-schema-generator --type User --file src/models.ts

# Pretty print
webda-schema-generator --type User --pretty

# Write to file
webda-schema-generator --type User --out schema.json --pretty

# Specify project
webda-schema-generator --type Config --project ./tsconfig.build.json

# Get help
webda-schema-generator --help
```

**Exit Codes:**

- `0` - Success
- `1` - Error (type not found, compilation error, etc.)

---

## Utility Functions

### isOptional()

Check if a TypeScript type is optional.

```typescript
function isOptional(type: ts.Type): boolean
```

**Parameters:**

- `type` - TypeScript type to check

**Returns:** `true` if optional, `false` otherwise

**Example:**

```typescript
const isOpt = isOptional(propertyType);
```

---

## Type Definitions

### Buffer Strategies

```typescript
type BufferStrategy = 'base64' | 'binary' | 'hex' | 'array';
```

**Values:**

- `'base64'` - Base64-encoded string with contentEncoding
- `'binary'` - String with format: binary (OpenAPI compatible)
- `'hex'` - Hexadecimal string with pattern validation
- `'array'` - Array of integers (0-255)

---

### Schema Type

```typescript
type SchemaType = 'input' | 'output';
```

**Values:**

- `'input'` - Generate schema for input validation (includes setters)
- `'output'` - Generate schema for output serialization (includes getters)

---

## Advanced Usage Examples

### Custom Buffer Mapper

```typescript
const generator = new SchemaGenerator({
  mapBuffer: (definition, ctx) => {
    // Check the path to determine strategy
    if (ctx.path.includes('image')) {
      // Images as base64
      definition.type = 'string';
      definition.contentEncoding = 'base64';
      definition.contentMediaType = 'image/png';
    } else if (ctx.path.includes('document')) {
      // Documents as binary
      definition.type = 'string';
      definition.format = 'binary';
    } else {
      // Default to hex
      definition.type = 'string';
      definition.pattern = '^[0-9a-fA-F]+$';
    }
  }
});
```

### Complex Transformer

```typescript
const generator = new SchemaGenerator({
  transformer: (options) => {
    const checker = generator.checker;

    // Get the type as string
    const typeString = checker.typeToString(options.type);

    // Handle specific type patterns
    if (typeString.includes('Sensitive')) {
      // Redact sensitive types
      options.definition.writeOnly = true;
    }

    // Check for custom decorators/JSDoc
    if (options.node) {
      const jsDoc = ts.getJSDocTags(options.node);
      const schemaTag = jsDoc.find(t => t.tagName.text === 'schema');

      if (schemaTag) {
        // Custom schema override
        const customSchema = JSON.parse(schemaTag.comment as string);
        Object.assign(options.definition, customSchema);
      }
    }

    // Transform based on depth
    if (options.depth > 5) {
      // Simplify deep nested types
      options.definition.description = 'Complex nested object';
      return options;
    }

    return options;
  }
});
```

### Multiple Type Generation

```typescript
import { writeFileSync } from 'fs';

const generator = new SchemaGenerator({
  project: './tsconfig.json',
  asRef: true
});

const types = ['User', 'Product', 'Order', 'Invoice'];
const schemas: Record<string, JSONSchema7> = {};

for (const typeName of types) {
  schemas[typeName] = generator.getSchemaForTypeName(typeName);
}

// Write all schemas to a single file
writeFileSync(
  'schemas.json',
  JSON.stringify(schemas, null, 2),
  'utf-8'
);
```

### OpenAPI Integration

```typescript
const generator = new SchemaGenerator({
  project: './tsconfig.json',
  bufferStrategy: 'binary', // OpenAPI uses binary format
  asRef: false // OpenAPI schemas are typically inlined
});

// Generate request schema
const createUserRequest = generator.getSchemaForTypeName(
  'CreateUserRequest',
  undefined,
  { type: 'input' }
);

// Generate response schema
const createUserResponse = generator.getSchemaForTypeName(
  'CreateUserResponse',
  undefined,
  { type: 'output' }
);

// Add to OpenAPI spec
const openApiSpec = {
  openapi: '3.0.0',
  paths: {
    '/users': {
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: createUserRequest
            }
          }
        },
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: createUserResponse
              }
            }
          }
        }
      }
    }
  }
};
```

### Validation with Ajv

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const generator = new SchemaGenerator({
  project: './tsconfig.json'
});

const schema = generator.getSchemaForTypeName('User');

// Remove $schema keyword (not needed for Ajv)
delete schema.$schema;

// Create Ajv instance
const ajv = new Ajv();
addFormats(ajv);

// Compile schema
const validate = ajv.compile(schema);

// Validate data
const userData = {
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com'
};

const valid = validate(userData);

if (!valid) {
  console.error('Validation errors:', validate.errors);
} else {
  console.log('Valid user data');
}
```

### Dynamic Schema Updates

```typescript
class DynamicSchemaGenerator {
  private generator: SchemaGenerator;
  private cache: Map<string, JSONSchema7> = new Map();

  constructor() {
    this.generator = new SchemaGenerator({
      project: './tsconfig.json'
    });
  }

  getSchema(typeName: string, bustCache = false): JSONSchema7 {
    if (bustCache) {
      this.cache.delete(typeName);
    }

    if (!this.cache.has(typeName)) {
      const schema = this.generator.getSchemaForTypeName(typeName);
      this.cache.set(typeName, schema);
    }

    return this.cache.get(typeName)!;
  }

  clearCache() {
    this.cache.clear();
  }
}
```

## Error Handling

### Common Errors

**Type Not Found:**

```typescript
try {
  const schema = generator.getSchemaForTypeName('NonExistent');
} catch (error) {
  console.error('Type not found:', error.message);
  // Error: Type "NonExistent" not found
}
```

**Invalid Project Path:**

```typescript
try {
  const generator = new SchemaGenerator({
    project: '/invalid/path'
  });
} catch (error) {
  console.error('Project error:', error.message);
  // Error: Could not find tsconfig.json in directory: /invalid/path
}
```

**TypeScript Compilation Errors:**

```typescript
// If your TypeScript files have compilation errors,
// the generator may not produce accurate schemas
const generator = new SchemaGenerator({
  project: './tsconfig.json',
  log: console.log // Enable logging to see issues
});
```

## Best Practices

### 1. Cache Generator Instances

```typescript
// Don't create a new generator for each schema
// ❌ Bad
function getSchema(type: string) {
  const gen = new SchemaGenerator({ project: './' });
  return gen.getSchemaForTypeName(type);
}

// ✅ Good
const generator = new SchemaGenerator({ project: './' });

function getSchema(type: string) {
  return generator.getSchemaForTypeName(type);
}
```

### 2. Use Type Safety

```typescript
// Import TypeScript types
import type { JSONSchema7 } from 'json-schema';

function generateSchema(typeName: string): JSONSchema7 {
  return generator.getSchemaForTypeName(typeName);
}
```

### 3. Handle Errors Gracefully

```typescript
function safeGenerateSchema(typeName: string): JSONSchema7 | null {
  try {
    return generator.getSchemaForTypeName(typeName);
  } catch (error) {
    console.error(`Failed to generate schema for ${typeName}:`, error);
    return null;
  }
}
```

### 4. Use Appropriate Options

```typescript
// For API validation
const apiGenerator = new SchemaGenerator({
  project: './tsconfig.json',
  asRef: false, // Inline for validators
  disableBooleanDefaultToFalse: false // Keep defaults
});

// For OpenAPI specs
const openApiGenerator = new SchemaGenerator({
  project: './tsconfig.json',
  bufferStrategy: 'binary', // OpenAPI format
  asRef: true // Use $ref for reusability
});
```

## Related Types

See the [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html) for more information on TypeScript types and the compiler API.

See the [JSON Schema specification](https://json-schema.org/draft-07/json-schema-release-notes.html) for more information on JSON Schema Draft-07.
