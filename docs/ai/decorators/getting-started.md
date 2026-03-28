---
sidebar_position: 2
title: Getting Started
description: Learn how to create and use TypeScript decorators with @webda/decorators
---

# Getting Started

This guide will walk you through creating your first decorators with `@webda/decorators`.

## Installation

Install the package using your preferred package manager:

```bash
npm install @webda/decorators
```

```bash
yarn add @webda/decorators
```

```bash
pnpm add @webda/decorators
```

## TypeScript Configuration

Ensure your `tsconfig.json` is configured for TC39 decorators (not legacy decorators):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "experimentalDecorators": false,  // Important: use TC39 standard
    "emitDecoratorMetadata": false
  }
}
```

## Creating Your First Decorator

### Method Decorator

Method decorators are applied to class methods. Here's a simple logging decorator:

```typescript
import { createMethodDecorator } from '@webda/decorators';

// Create the decorator
const Log = createMethodDecorator((value, context) => {
  // value: the original method
  // context: decorator context with metadata

  return function(...args: any[]) {
    console.log(`Calling ${String(context.name)} with args:`, args);
    const result = value.apply(this, args);
    console.log(`Result:`, result);
    return result;
  };
});

// Use the decorator
class Calculator {
  @Log
  add(a: number, b: number) {
    return a + b;
  }
}

const calc = new Calculator();
calc.add(5, 3);
// Output:
// Calling add with args: [5, 3]
// Result: 8
```

### Method Decorator with Options

Add optional parameters to customize behavior:

```typescript
import { createMethodDecorator } from '@webda/decorators';

interface LogOptions {
  prefix?: string;
  logArgs?: boolean;
  logResult?: boolean;
}

const Log = createMethodDecorator(
  (value, context, options?: LogOptions) => {
    const prefix = options?.prefix ?? '';
    const logArgs = options?.logArgs ?? true;
    const logResult = options?.logResult ?? true;

    return function(...args: any[]) {
      if (logArgs) {
        console.log(`${prefix}Calling ${String(context.name)}`, args);
      }

      const result = value.apply(this, args);

      if (logResult) {
        console.log(`${prefix}Result:`, result);
      }

      return result;
    };
  }
);

class Calculator {
  // Direct use - default options
  @Log
  add(a: number, b: number) {
    return a + b;
  }

  // With options
  @Log({ prefix: '[CALC] ', logResult: false })
  subtract(a: number, b: number) {
    return a - b;
  }

  @Log({ prefix: '[CALC] ', logArgs: false })
  multiply(a: number, b: number) {
    return a * b;
  }
}
```

### Async Method Decorator

Handle asynchronous methods properly:

```typescript
import { createMethodDecorator } from '@webda/decorators';

const Retry = createMethodDecorator(
  (value, context, maxAttempts: number = 3) => {
    return async function(...args: any[]) {
      let lastError: any;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await value.apply(this, args);
          return result;
        } catch (error) {
          lastError = error;
          console.log(`Attempt ${attempt} failed, retrying...`);

          if (attempt < maxAttempts) {
            // Wait before retry (exponential backoff)
            await new Promise(resolve =>
              setTimeout(resolve, Math.pow(2, attempt) * 100)
            );
          }
        }
      }

      throw lastError;
    };
  }
);

class ApiClient {
  @Retry(5)
  async fetchData(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }
}
```

### Class Decorator

Class decorators are applied to class declarations:

```typescript
import { createClassDecorator } from '@webda/decorators';

const Singleton = createClassDecorator((value, context) => {
  let instance: any = null;

  return class extends value {
    constructor(...args: any[]) {
      if (instance) {
        return instance;
      }
      super(...args);
      instance = this;
    }
  };
});

@Singleton
class DatabaseConnection {
  constructor(public connectionString: string) {
    console.log('Creating database connection');
  }
}

const db1 = new DatabaseConnection('localhost');
const db2 = new DatabaseConnection('localhost');
console.log(db1 === db2);  // true - same instance
```

### Class Decorator with Options

Add configuration options to class decorators:

```typescript
import { createClassDecorator } from '@webda/decorators';

interface ComponentOptions {
  name?: string;
  singleton?: boolean;
}

const Component = createClassDecorator(
  (value, context, options?: ComponentOptions) => {
    const name = options?.name ?? value.name;
    const singleton = options?.singleton ?? false;

    // Register in a global registry
    componentRegistry.set(name, {
      class: value,
      singleton,
      instance: null
    });

    console.log(`Registered component: ${name}`);
  }
);

@Component
class DefaultComponent {}

@Component({ name: 'CustomName' })
class NamedComponent {}

@Component({ name: 'SingletonService', singleton: true })
class ServiceComponent {}
```

### Property Decorator

Property decorators are applied to class fields:

```typescript
import { createPropertyDecorator } from '@webda/decorators';

const Default = createPropertyDecorator(
  (context, defaultValue?: any) => {
    // Store default value in metadata
    context.metadata['defaults'] ??= {};
    context.metadata['defaults'][String(context.name)] = defaultValue;

    // Return initializer function
    return function(initialValue: any) {
      return initialValue ?? defaultValue;
    };
  }
);

class User {
  @Default('guest')
  username: string;

  @Default('user@example.com')
  email: string;

  @Default(true)
  active: boolean;
}

const user = new User();
console.log(user.username);  // 'guest'
console.log(user.active);    // true
```

### Property Decorator for Validation

Create a validation decorator that stores metadata:

```typescript
import { createPropertyDecorator, getMetadata } from '@webda/decorators';

interface ValidationRule {
  type: 'min' | 'max' | 'pattern' | 'required';
  value?: any;
}

const Validate = createPropertyDecorator(
  (context, rule: ValidationRule) => {
    // Store validation rules in metadata
    context.metadata['validations'] ??= {};
    context.metadata['validations'][String(context.name)] ??= [];
    context.metadata['validations'][String(context.name)].push(rule);
  }
);

class CreateUserDTO {
  @Validate({ type: 'required' })
  @Validate({ type: 'min', value: 3 })
  username: string;

  @Validate({ type: 'required' })
  @Validate({ type: 'pattern', value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })
  email: string;

  @Validate({ type: 'min', value: 8 })
  password: string;
}

// Validation function using metadata
function validate(obj: any): string[] {
  const errors: string[] = [];
  const metadata = getMetadata(obj.constructor);
  const validations = metadata?.validations ?? {};

  for (const [field, rules] of Object.entries(validations)) {
    const value = obj[field];

    for (const rule of rules as ValidationRule[]) {
      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            errors.push(`${field} is required`);
          }
          break;
        case 'min':
          if (value && value.length < rule.value) {
            errors.push(`${field} must be at least ${rule.value} characters`);
          }
          break;
        case 'pattern':
          if (value && !rule.value.test(value)) {
            errors.push(`${field} has invalid format`);
          }
          break;
      }
    }
  }

  return errors;
}

// Usage
const dto = new CreateUserDTO();
dto.username = 'ab';  // Too short
dto.email = 'invalid';  // Invalid format

const errors = validate(dto);
console.log(errors);
// ['username must be at least 3 characters', 'email has invalid format']
```

## Working with Metadata

Decorators can store metadata using the context's `metadata` object:

```typescript
import { createPropertyDecorator, getMetadata } from '@webda/decorators';

const Column = createPropertyDecorator(
  (context, options?: { type?: string; nullable?: boolean }) => {
    // Initialize metadata structure
    context.metadata['columns'] ??= [];

    // Store column metadata
    context.metadata['columns'].push({
      name: String(context.name),
      type: options?.type ?? 'string',
      nullable: options?.nullable ?? false
    });
  }
);

const Table = createClassDecorator(
  (value, context, tableName?: string) => {
    context.metadata['tableName'] = tableName ?? value.name.toLowerCase();
  }
);

@Table('users')
class User {
  @Column({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string;

  @Column({ type: 'boolean' })
  active: boolean;
}

// Access metadata
const metadata = getMetadata(User);
console.log(metadata.tableName);  // 'users'
console.log(metadata.columns);
// [
//   { name: 'id', type: 'uuid', nullable: false },
//   { name: 'username', type: 'varchar', nullable: false },
//   { name: 'email', type: 'varchar', nullable: true },
//   { name: 'active', type: 'boolean', nullable: false }
// ]
```

## Common Patterns

### Combining Multiple Decorators

You can apply multiple decorators to the same target:

```typescript
class UserService {
  @Log({ prefix: '[Service] ' })
  @Retry(3)
  @Measure
  async createUser(data: any) {
    // Implementation
  }
}
```

Decorators are applied bottom-to-top (closest to the method first).

### Decorator Factory Pattern

Create higher-order functions that return configured decorators:

```typescript
function createCacheDecorator(ttl: number) {
  return createMethodDecorator((value, context) => {
    const cache = new Map();

    return function(...args: any[]) {
      const key = JSON.stringify(args);
      const cached = cache.get(key);

      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }

      const result = value.apply(this, args);
      cache.set(key, { value: result, timestamp: Date.now() });
      return result;
    };
  });
}

// Use the factory
const Cache5Min = createCacheDecorator(5 * 60 * 1000);
const Cache1Hour = createCacheDecorator(60 * 60 * 1000);

class DataService {
  @Cache5Min
  async getRecentData() {
    // Cached for 5 minutes
  }

  @Cache1Hour
  async getStaticData() {
    // Cached for 1 hour
  }
}
```

### Type-Safe Decorators

Leverage TypeScript generics for type safety:

```typescript
import { createMethodDecorator } from '@webda/decorators';
import type { AnyMethod } from '@webda/decorators';

const TypedLog = createMethodDecorator(
  <T extends (...args: any[]) => any>(
    value: T,
    context: ClassMethodDecoratorContext<any, T>
  ) => {
    return function(...args: Parameters<T>): ReturnType<T> {
      console.log(`Calling ${String(context.name)}`);
      return value.apply(this, args) as ReturnType<T>;
    };
  }
);

class Calculator {
  @TypedLog
  add(a: number, b: number): number {
    return a + b;
  }
}
```

## Best Practices

### 1. Keep Decorators Focused

Each decorator should have a single, clear responsibility:

```typescript
// Good: Single responsibility
const Measure = createMethodDecorator((value, context) => {
  // Only handles timing
});

const Log = createMethodDecorator((value, context) => {
  // Only handles logging
});

// Bad: Multiple responsibilities
const MeasureAndLog = createMethodDecorator((value, context) => {
  // Does too much
});
```

### 2. Handle Edge Cases

Always consider async methods, errors, and different return types:

```typescript
const Safe = createMethodDecorator((value, context) => {
  return function(...args: any[]) {
    try {
      const result = value.apply(this, args);

      // Handle promises
      if (result instanceof Promise) {
        return result.catch(error => {
          console.error(`Error in ${String(context.name)}:`, error);
          return undefined;
        });
      }

      return result;
    } catch (error) {
      console.error(`Error in ${String(context.name)}:`, error);
      return undefined;
    }
  };
});
```

### 3. Preserve Method Context

Always use `apply()` to maintain the correct `this` context:

```typescript
const Decorator = createMethodDecorator((value, context) => {
  return function(...args: any[]) {
    // Good: preserves 'this'
    return value.apply(this, args);

    // Bad: loses 'this' context
    // return value(...args);
  };
});
```

### 4. Document Your Decorators

Provide clear JSDoc comments for better IDE support:

```typescript
/**
 * Caches method results for a specified duration
 * @param ttl - Time to live in milliseconds
 * @example
 * ```typescript
 * class Service {
 *   @Cache(5000)
 *   async getData() {
 *     return fetchData();
 *   }
 * }
 * ```
 */
const Cache = createMethodDecorator(
  (value, context, ttl: number = 60000) => {
    // Implementation
  }
);
```

### 5. Use TypeScript Interfaces for Options

Define clear interfaces for decorator options:

```typescript
interface CacheOptions {
  /** Time to live in milliseconds */
  ttl: number;
  /** Cache key generator function */
  keyGen?: (...args: any[]) => string;
  /** Whether to cache errors */
  cacheErrors?: boolean;
}

const Cache = createMethodDecorator(
  (value, context, options: CacheOptions) => {
    // Fully typed options
  }
);
```

## Next Steps

Now that you understand the basics, explore the complete API:

- [API Reference](./api-reference.md) - Detailed API documentation with all types and signatures

## Examples Repository

For more examples, check out the test files in the repository:
- [decorator.spec.ts](https://github.com/loopingz/webda.io/blob/main/packages/decorators/src/decorator.spec.ts)
