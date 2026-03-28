---
sidebar_position: 1
title: Overview
description: Introduction to @webda/decorators - TypeScript decorator utilities with dual-mode support
---

# @webda/decorators

A lightweight, zero-dependency library for creating type-safe TypeScript decorators that support both direct application and factory patterns.

## What is @webda/decorators?

`@webda/decorators` provides utilities to create ES2022-compliant TypeScript decorators with a consistent, ergonomic API. It eliminates the boilerplate of supporting both `@decorator` and `@decorator(options)` syntax while maintaining full type safety.

**Key capabilities:**

- **Dual-Mode Decorators** - Create decorators that work with or without parentheses
- **Type Safety** - Full TypeScript support with proper type inference
- **TC39 Compliant** - Uses the latest ES2022 decorator specification
- **Zero Dependencies** - Minimal footprint with no external dependencies
- **Metadata Access** - Built-in utilities for accessing decorator metadata

## Why Use @webda/decorators?

### The Problem

Creating TypeScript decorators that support both syntaxes requires complex overload signatures and runtime detection:

```typescript
// Without @webda/decorators - verbose and error-prone
function MyDecorator(options?: { name: string }) {
  return function(target: any, context: ClassMethodDecoratorContext) {
    // Implementation
  };
}

// OR (different signature for direct use)
function MyDecorator(target: any, context: ClassMethodDecoratorContext) {
  // Implementation
}

// Users must choose one or implement complex overloads
```

### The Solution

`@webda/decorators` handles the complexity for you:

```typescript
import { createMethodDecorator } from '@webda/decorators';

const MyDecorator = createMethodDecorator(
  (value, context, options?: { name: string }) => {
    // Single implementation handles both cases
    console.log(options?.name ?? 'default');
  }
);

// Both syntaxes work automatically
class Example {
  @MyDecorator
  method1() {}

  @MyDecorator({ name: 'custom' })
  method2() {}
}
```

## Key Features

### 🎯 Dual-Mode Support

Decorators automatically support both direct application and factory patterns without additional code.

```typescript
import { createClassDecorator } from '@webda/decorators';

const Route = createClassDecorator(
  (value, context, path?: string) => {
    const route = path ?? '/';
    console.log(`Registering route: ${route}`);
  }
);

@Route              // Uses default '/'
class HomeController {}

@Route('/api/users')  // Uses custom path
class UsersController {}
```

### 🛡️ Full Type Safety

TypeScript properly infers all types, providing autocomplete and compile-time checking.

```typescript
import { createMethodDecorator } from '@webda/decorators';

// Options are fully typed
interface LogOptions {
  level: 'info' | 'debug' | 'error';
  prefix?: string;
}

const Log = createMethodDecorator(
  (value, context, options?: LogOptions) => {
    // options is properly typed
    const level = options?.level ?? 'info';
    const prefix = options?.prefix ?? '';
  }
);

class Service {
  @Log({ level: 'debug', prefix: '[API]' })  // ✅ Type-checked
  async fetchData() {}

  // @Log({ level: 'warning' })  // ❌ TypeScript error: invalid level
}
```

### 📋 TC39 Standard Compliance

Uses the modern ES2022 decorator specification with proper context objects.

```typescript
import { createPropertyDecorator } from '@webda/decorators';

const Validate = createPropertyDecorator(
  (context, pattern?: RegExp) => {
    // Access standard decorator context
    console.log(`Field name: ${String(context.name)}`);
    console.log(`Kind: ${context.kind}`);
    console.log(`Static: ${context.static}`);
    console.log(`Private: ${context.private}`);

    // Store metadata
    context.metadata[`validate_${String(context.name)}`] = pattern;
  }
);

class User {
  @Validate(/^[a-z0-9]+$/)
  username: string;
}
```

### 🔍 Metadata Access

Easily retrieve decorator metadata from decorated classes.

```typescript
import { createPropertyDecorator, getMetadata } from '@webda/decorators';

const Required = createPropertyDecorator((context) => {
  context.metadata['required'] ??= [];
  (context.metadata['required'] as string[]).push(String(context.name));
});

class CreateUserDTO {
  @Required email: string;
  @Required password: string;
  nickname?: string;
}

// Access metadata
const metadata = getMetadata(CreateUserDTO);
console.log(metadata.required);  // ['email', 'password']
```

## Installation

```bash
npm install @webda/decorators
```

```bash
yarn add @webda/decorators
```

```bash
pnpm add @webda/decorators
```

## Requirements

- **Node.js:** >=22.0.0
- **TypeScript:** >=5.0.0 (with `experimentalDecorators: false`)
- **Module System:** ES Modules (ESM)

**TypeScript Configuration:**

Ensure your `tsconfig.json` uses the modern decorator standard:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false,  // Use TC39 decorators
    "emitDecoratorMetadata": false
  }
}
```

## Quick Start

```typescript
import {
  createMethodDecorator,
  createClassDecorator,
  createPropertyDecorator,
  getMetadata
} from '@webda/decorators';

// Create a timing decorator
const Measure = createMethodDecorator((value, context) => {
  return function(...args: any[]) {
    const start = Date.now();
    const result = value.apply(this, args);
    console.log(`${String(context.name)} took ${Date.now() - start}ms`);
    return result;
  };
});

// Create a class decorator
const Component = createClassDecorator(
  (value, context, name?: string) => {
    console.log(`Registering component: ${name ?? value.name}`);
  }
);

// Create a property decorator
const Inject = createPropertyDecorator(
  (context, token?: string) => {
    const key = token ?? String(context.name);
    context.metadata['injections'] ??= {};
    context.metadata['injections'][String(context.name)] = key;
  }
);

// Use the decorators
@Component('UserService')
class UserService {
  @Inject('database')
  db: any;

  @Measure
  async getUser(id: string) {
    // Method logic
  }

  @Measure
  async saveUser(user: any) {
    // Method logic
  }
}

// Access metadata
const meta = getMetadata(UserService);
console.log(meta.injections);  // { db: 'database' }
```

## Use Cases

### Validation Decorators

```typescript
const Validate = createPropertyDecorator(
  (context, validator?: (val: any) => boolean) => {
    context.metadata['validators'] ??= {};
    context.metadata['validators'][String(context.name)] = validator;
  }
);

class User {
  @Validate(v => v.length >= 3)
  username: string;

  @Validate(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
  email: string;
}
```

### Dependency Injection

```typescript
const Injectable = createClassDecorator((value, context) => {
  // Register class in DI container
  container.register(value.name, value);
});

const Inject = createPropertyDecorator((context, token?: string) => {
  // Store injection metadata
  context.metadata['injections'] ??= [];
  context.metadata['injections'].push({
    property: String(context.name),
    token: token ?? String(context.name)
  });
});

@Injectable
class DatabaseService {
  @Inject('connection')
  private conn: any;
}
```

### Route Definition

```typescript
const Controller = createClassDecorator(
  (value, context, basePath?: string) => {
    context.metadata['basePath'] = basePath ?? '/';
  }
);

const Get = createMethodDecorator(
  (value, context, path?: string) => {
    context.metadata['routes'] ??= [];
    context.metadata['routes'].push({
      method: 'GET',
      path: path ?? '/',
      handler: String(context.name)
    });
  }
);

@Controller('/api/users')
class UsersController {
  @Get('/')
  list() {}

  @Get('/:id')
  getById() {}
}
```

### Performance Monitoring

```typescript
const Track = createMethodDecorator(
  (value, context, metric?: string) => {
    return function(...args: any[]) {
      const start = performance.now();
      const result = value.apply(this, args);

      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - start;
          metrics.record(metric ?? String(context.name), duration);
        });
      }

      const duration = performance.now() - start;
      metrics.record(metric ?? String(context.name), duration);
      return result;
    };
  }
);

class DataService {
  @Track('db.query')
  async query(sql: string) {
    // Database query
  }
}
```

## How It Works

The library detects at runtime whether the decorator was called directly or as a factory:

1. **Direct Application** (`@decorator`):
   - First argument is the target (function/class)
   - Second argument is the decorator context
   - Implementation receives empty args array

2. **Factory Application** (`@decorator(args)`):
   - Arguments are the factory parameters
   - Returns a decorator function
   - Implementation receives the factory arguments

This detection happens automatically, allowing you to write a single implementation that handles both cases.

## Package Information

- **Version:** 4.0.0-beta.1
- **License:** LGPL-3.0-only
- **Repository:** [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io)
- **Node.js:** >=22.0.0
- **Dependencies:** None
- **Module Type:** ES Module (ESM)

## Next Steps

- [Getting Started](./getting-started.md) - Create your first decorators
- [API Reference](./api-reference.md) - Complete API documentation

## Contributing

This package is part of the Webda.io project. Contributions are welcome!

## Support

- **Documentation:** [webda.io/docs](https://webda.io/docs)
- **Issues:** [GitHub Issues](https://github.com/loopingz/webda.io/issues)
- **Community:** Join our community for support and discussions
