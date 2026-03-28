---
sidebar_position: 3
title: API Reference
description: Complete API documentation for @webda/decorators
---

# API Reference

Complete reference for all types, functions, and utilities in `@webda/decorators`.

## Core Functions

### createMethodDecorator()

Creates a method decorator that supports both direct application and factory patterns.

**Signature:**

```typescript
function createMethodDecorator<
  T extends AnyMethod,
  C extends ClassMethodDecoratorContext<any, any>,
  TArgs extends any[]
>(
  implementation: (value: T, context: C, ...args: TArgs) => T | void
): {
  (value: T, context: C): T | void;
  (...args: TArgs): (value: T, context: C) => T | void;
}
```

**Type Parameters:**

- `T` - The method signature type (extends `AnyMethod`)
- `C` - The decorator context type (extends `ClassMethodDecoratorContext`)
- `TArgs` - The decorator arguments type (tuple of argument types)

**Parameters:**

- `implementation` - Function that implements the decorator logic
  - `value` - The original method being decorated
  - `context` - The decorator context object
  - `...args` - Optional arguments passed to the decorator factory

**Returns:**

A decorator function that can be used in both modes:
- Direct: `@decorator`
- Factory: `@decorator(args)`

**Example:**

```typescript
import { createMethodDecorator } from '@webda/decorators';

// Without options
const Measure = createMethodDecorator((value, context) => {
  return function(...args: any[]) {
    const start = Date.now();
    const result = value.apply(this, args);
    console.log(`${String(context.name)}: ${Date.now() - start}ms`);
    return result;
  };
});

// With options
interface LogOptions {
  prefix?: string;
  level?: 'info' | 'debug' | 'error';
}

const Log = createMethodDecorator(
  (value, context, options?: LogOptions) => {
    const prefix = options?.prefix ?? '';
    const level = options?.level ?? 'info';

    return function(...args: any[]) {
      console[level](`${prefix}${String(context.name)}`, args);
      return value.apply(this, args);
    };
  }
);

class Example {
  @Measure
  method1() {}

  @Log({ prefix: '[API] ', level: 'debug' })
  method2() {}
}
```

**Context Properties:**

The `context` parameter provides access to:

```typescript
interface ClassMethodDecoratorContext<This = unknown, Value = unknown> {
  kind: 'method';
  name: string | symbol;
  static: boolean;
  private: boolean;
  access: {
    get(this: This): Value;
  };
  metadata: Record<PropertyKey, unknown>;
  addInitializer(initializer: (this: This) => void): void;
}
```

---

### createClassDecorator()

Creates a class decorator that supports both direct application and factory patterns.

**Signature:**

```typescript
function createClassDecorator<TArgs extends any[]>(
  impl: <C extends AnyCtor>(
    value: C,
    context: ClassDecoratorContext,
    ...args: TArgs
  ) => C | void
): {
  <C extends AnyCtor>(value: C, context: ClassDecoratorContext): C | void;
  (...args: TArgs): <C extends AnyCtor>(
    value: C,
    context: ClassDecoratorContext
  ) => C | void;
}
```

**Type Parameters:**

- `TArgs` - The decorator arguments type (tuple of argument types)

**Parameters:**

- `impl` - Function that implements the decorator logic
  - `value` - The class constructor being decorated
  - `context` - The decorator context object
  - `...args` - Optional arguments passed to the decorator factory

**Returns:**

A decorator function that can be used in both modes:
- Direct: `@decorator`
- Factory: `@decorator(args)`

**Example:**

```typescript
import { createClassDecorator } from '@webda/decorators';

// Without options
const Sealed = createClassDecorator((value, context) => {
  Object.seal(value);
  Object.seal(value.prototype);
});

// With options
interface ComponentOptions {
  name?: string;
  singleton?: boolean;
}

const Component = createClassDecorator(
  (value, context, options?: ComponentOptions) => {
    const name = options?.name ?? value.name;
    const singleton = options?.singleton ?? false;

    // Register component
    registry.set(name, { class: value, singleton });

    console.log(`Registered: ${name}`);
  }
);

@Sealed
class ImmutableClass {}

@Component({ name: 'MyService', singleton: true })
class MyService {}
```

**Context Properties:**

```typescript
interface ClassDecoratorContext<Class = unknown> {
  kind: 'class';
  name: string | undefined;
  metadata: Record<PropertyKey, unknown>;
  addInitializer(initializer: (this: Class) => void): void;
}
```

---

### createPropertyDecorator()

Creates a property (field) decorator that supports both direct application and factory patterns.

**Signature:**

```typescript
function createPropertyDecorator<
  TArgs extends any[],
  C extends ClassFieldDecoratorContext
>(
  impl: (context: C, ...args: TArgs) =>
    ((target: undefined, context: C) => void) | void
): {
  (target: undefined, context: C): void;
  (...args: TArgs): (target: undefined, context: C) => void;
}
```

**Type Parameters:**

- `TArgs` - The decorator arguments type (tuple of argument types)
- `C` - The decorator context type (extends `ClassFieldDecoratorContext`)

**Parameters:**

- `impl` - Function that implements the decorator logic
  - `context` - The decorator context object
  - `...args` - Optional arguments passed to the decorator factory

**Returns:**

A decorator function that can be used in both modes:
- Direct: `@decorator`
- Factory: `@decorator(args)`

**Example:**

```typescript
import { createPropertyDecorator } from '@webda/decorators';

// Without options
const Required = createPropertyDecorator((context) => {
  context.metadata['required'] ??= [];
  (context.metadata['required'] as string[]).push(String(context.name));
});

// With options
interface ColumnOptions {
  type?: string;
  nullable?: boolean;
  unique?: boolean;
}

const Column = createPropertyDecorator(
  (context, options?: ColumnOptions) => {
    context.metadata['columns'] ??= [];
    context.metadata['columns'].push({
      name: String(context.name),
      type: options?.type ?? 'string',
      nullable: options?.nullable ?? false,
      unique: options?.unique ?? false
    });
  }
);

class User {
  @Required
  @Column({ type: 'uuid', unique: true })
  id: string;

  @Required
  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string;
}
```

**Context Properties:**

```typescript
interface ClassFieldDecoratorContext<This = unknown, Value = unknown> {
  kind: 'field';
  name: string | symbol;
  static: boolean;
  private: boolean;
  access: {
    get(this: This): Value;
    set(this: This, value: Value): void;
  };
  metadata: Record<PropertyKey, unknown>;
  addInitializer(initializer: (this: This) => void): void;
}
```

---

### getMetadata()

Retrieves the metadata object from a decorated class.

**Signature:**

```typescript
function getMetadata(target: AnyCtor): any
```

**Parameters:**

- `target` - The class constructor to retrieve metadata from

**Returns:**

The metadata object associated with the class, or `undefined` if no metadata exists.

**Example:**

```typescript
import { createPropertyDecorator, getMetadata } from '@webda/decorators';

const Column = createPropertyDecorator((context, type?: string) => {
  context.metadata['columns'] ??= [];
  context.metadata['columns'].push({
    name: String(context.name),
    type: type ?? 'string'
  });
});

class User {
  @Column('uuid')
  id: string;

  @Column('varchar')
  username: string;
}

const metadata = getMetadata(User);
console.log(metadata.columns);
// [
//   { name: 'id', type: 'uuid' },
//   { name: 'username', type: 'varchar' }
// ]
```

**Metadata Structure:**

The metadata object is a plain JavaScript object where:
- Keys are decorator-defined property names
- Values are decorator-defined data structures

Each decorator is responsible for organizing its own metadata:

```typescript
// Good: Namespaced metadata
context.metadata['myDecorator:options'] = options;
context.metadata['myDecorator:fields'] = [];

// Also good: Nested structure
context.metadata['myDecorator'] = {
  options,
  fields: []
};
```

---

## Type Definitions

### AnyMethod

Type alias for any method signature.

```typescript
type AnyMethod = (...args: any[]) => any;
```

---

### AnyCtor

Type alias for any constructor (class).

```typescript
type AnyCtor<T = unknown> = abstract new (...args: any[]) => T;
```

**Example:**

```typescript
function isClass(value: any): value is AnyCtor {
  return typeof value === 'function' && value.prototype !== undefined;
}
```

---

### FieldDecorator

Type alias for decorators created with `createPropertyDecorator()`.

```typescript
type FieldDecorator = ReturnType<typeof createPropertyDecorator>;
```

**Example:**

```typescript
const myDecorator: FieldDecorator = createPropertyDecorator((context) => {
  // Implementation
});
```

---

### ClassDecorator

Type alias for decorators created with `createClassDecorator()`.

```typescript
type ClassDecorator = ReturnType<typeof createClassDecorator>;
```

**Example:**

```typescript
const myDecorator: ClassDecorator = createClassDecorator((value, context) => {
  // Implementation
});
```

---

### MethodDecorator

Type alias for decorators created with `createMethodDecorator()`.

```typescript
type MethodDecorator = ReturnType<typeof createMethodDecorator>;
```

**Example:**

```typescript
const myDecorator: MethodDecorator = createMethodDecorator((value, context) => {
  // Implementation
});
```

---

### DecoratorPropertyParameters

Utility type that extracts parameter types from a property decorator implementation, excluding the context parameter.

```typescript
type DecoratorPropertyParameters<
  T extends (context: ClassFieldDecoratorContext<any, any>, ...args: any[]) => any
> = SkipFirst<Parameters<T>>;
```

**Example:**

```typescript
type MyDecoratorImpl = (
  context: ClassFieldDecoratorContext,
  required: boolean,
  maxLength?: number
) => void;

type MyDecoratorArgs = DecoratorPropertyParameters<MyDecoratorImpl>;
// Result: [required: boolean, maxLength?: number]
```

---

## Decorator Context Objects

All decorators receive a context object as their second parameter. The context provides metadata about where the decorator is applied.

### ClassMethodDecoratorContext

Context object for method decorators.

```typescript
interface ClassMethodDecoratorContext<This = unknown, Value = unknown> {
  /** Always 'method' for method decorators */
  kind: 'method';

  /** The name of the method */
  name: string | symbol;

  /** Whether the method is static */
  static: boolean;

  /** Whether the method is private */
  private: boolean;

  /** Access object for getting the method */
  access: {
    get(this: This): Value;
  };

  /** Metadata storage shared across decorators */
  metadata: Record<PropertyKey, unknown>;

  /** Add an initializer to run after class instantiation */
  addInitializer(initializer: (this: This) => void): void;
}
```

---

### ClassDecoratorContext

Context object for class decorators.

```typescript
interface ClassDecoratorContext<Class = unknown> {
  /** Always 'class' for class decorators */
  kind: 'class';

  /** The name of the class (may be undefined for anonymous classes) */
  name: string | undefined;

  /** Metadata storage shared across decorators */
  metadata: Record<PropertyKey, unknown>;

  /** Add an initializer to run when class is defined */
  addInitializer(initializer: (this: Class) => void): void;
}
```

---

### ClassFieldDecoratorContext

Context object for property (field) decorators.

```typescript
interface ClassFieldDecoratorContext<This = unknown, Value = unknown> {
  /** Always 'field' for field decorators */
  kind: 'field';

  /** The name of the field */
  name: string | symbol;

  /** Whether the field is static */
  static: boolean;

  /** Whether the field is private */
  private: boolean;

  /** Access object for getting/setting the field */
  access: {
    get(this: This): Value;
    set(this: This, value: Value): void;
  };

  /** Metadata storage shared across decorators */
  metadata: Record<PropertyKey, unknown>;

  /** Add an initializer to run after field initialization */
  addInitializer(initializer: (this: This) => void): void;
}
```

---

## Advanced Usage

### Type-Safe Decorator Arguments

Use TypeScript generics to enforce type safety:

```typescript
import { createMethodDecorator } from '@webda/decorators';

interface CacheOptions {
  ttl: number;
  key?: string;
}

const Cache = createMethodDecorator(
  (value, context, options: CacheOptions) => {
    // options is fully typed
    const ttl: number = options.ttl;
    const key: string | undefined = options.key;

    return function(...args: any[]) {
      // Implementation
      return value.apply(this, args);
    };
  }
);

class Service {
  // ✅ Type-checked
  @Cache({ ttl: 5000 })
  getData() {}

  // ❌ TypeScript error: missing required 'ttl'
  // @Cache({ key: 'test' })
  // getData2() {}
}
```

### Accessing Decorator Context Properties

Extract useful information from the context:

```typescript
const Debug = createMethodDecorator((value, context) => {
  const methodName = String(context.name);
  const isStatic = context.static;
  const isPrivate = context.private;

  console.log(`Decorating ${isStatic ? 'static' : 'instance'} method: ${methodName}`);
  console.log(`Private: ${isPrivate}`);

  return function(...args: any[]) {
    console.log(`Calling ${methodName}`, { isStatic, isPrivate, args });
    return value.apply(this, args);
  };
});
```

### Using addInitializer

Run code when the class is instantiated:

```typescript
const Init = createPropertyDecorator((context) => {
  context.addInitializer(function() {
    console.log(`Instance created with ${String(context.name)}`);
  });
});

class Example {
  @Init
  value: string = 'test';
}

const ex = new Example();
// Output: "Instance created with value"
```

### Storing Complex Metadata

Organize metadata for later retrieval:

```typescript
interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern';
  value?: any;
  message?: string;
}

const Validate = createPropertyDecorator(
  (context, rule: ValidationRule) => {
    // Initialize nested metadata structure
    context.metadata['validation'] ??= {};
    const validation = context.metadata['validation'] as Record<string, ValidationRule[]>;

    validation[String(context.name)] ??= [];
    validation[String(context.name)].push(rule);
  }
);

class User {
  @Validate({ type: 'required', message: 'Username is required' })
  @Validate({ type: 'min', value: 3, message: 'Username too short' })
  username: string;
}

// Access metadata
const metadata = getMetadata(User);
const usernameRules = metadata.validation.username;
// [
//   { type: 'required', message: 'Username is required' },
//   { type: 'min', value: 3, message: 'Username too short' }
// ]
```

### Creating Decorator Factories

Build higher-order functions that create decorators:

```typescript
function createValidator<T>(
  validate: (value: T) => boolean,
  message: string
) {
  return createPropertyDecorator((context) => {
    context.metadata['validators'] ??= {};
    (context.metadata['validators'] as any)[String(context.name)] = {
      validate,
      message
    };
  });
}

// Create specialized validators
const IsEmail = createValidator(
  (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  'Invalid email format'
);

const IsPositive = createValidator(
  (value: number) => value > 0,
  'Must be positive'
);

class Form {
  @IsEmail
  email: string;

  @IsPositive
  age: number;
}
```

### Composing Decorators

Create decorators that combine multiple behaviors:

```typescript
function createTrackedMethod(name: string) {
  const Log = createMethodDecorator((value, context) => {
    return function(...args: any[]) {
      console.log(`[${name}] Calling ${String(context.name)}`);
      return value.apply(this, args);
    };
  });

  const Measure = createMethodDecorator((value, context) => {
    return function(...args: any[]) {
      const start = Date.now();
      const result = value.apply(this, args);
      console.log(`[${name}] ${String(context.name)}: ${Date.now() - start}ms`);
      return result;
    };
  });

  return { Log, Measure };
}

const { Log, Measure } = createTrackedMethod('API');

class Service {
  @Log
  @Measure
  async fetchData() {
    // Implementation
  }
}
```

## Symbol.metadata

The library includes a polyfill for `Symbol.metadata` to ensure compatibility:

```typescript
(Symbol as any).metadata ??= Symbol.for("Symbol.metadata");
```

This ensures that metadata works correctly across different environments and TypeScript versions.

## Browser Compatibility

The library uses TC39 stage 3 decorators (ES2022), which require:

- **Node.js:** >=22.0.0 (native support)
- **TypeScript:** >=5.0.0 (with `experimentalDecorators: false`)
- **Browsers:** Modern browsers with ES2022 support, or use a transpiler like Babel

For older environments, use a transpiler configured for TC39 decorators:

```json
{
  "plugins": [
    ["@babel/plugin-proposal-decorators", { "version": "2023-05" }]
  ]
}
```

## Package Exports

The package exports all functionality from a single entry point:

```typescript
import {
  // Core functions
  createMethodDecorator,
  createClassDecorator,
  createPropertyDecorator,
  getMetadata,

  // Type definitions
  AnyMethod,
  AnyCtor,
  FieldDecorator,
  ClassDecorator,
  MethodDecorator,
  DecoratorPropertyParameters
} from '@webda/decorators';
```

## Related Resources

- **TC39 Decorator Proposal:** [github.com/tc39/proposal-decorators](https://github.com/tc39/proposal-decorators)
- **TypeScript Decorators:** [typescriptlang.org/docs/handbook/decorators.html](https://www.typescriptlang.org/docs/handbook/decorators.html)
- **Source Code:** [github.com/loopingz/webda.io/packages/decorators](https://github.com/loopingz/webda.io/tree/main/packages/decorators)
