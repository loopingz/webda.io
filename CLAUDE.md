# Claude Code Guidelines for Webda.io

This document provides comprehensive guidance for Claude when working with the Webda.io codebase. It complements the existing [AGENTS.md](AGENTS.md) and [.github/copilot-instructions.md](.github/copilot-instructions.md).

## Project Overview

**Webda.io** is a Domain-Driven Design (DDD) framework for Node.js that provides:

- Dependency injection system
- Model-driven applications with multi-database abstraction
- Cloud-native deployment strategies (Lambda/APIGateway, Kubernetes, Docker)
- Automatic REST API and GraphQL generation from models
- Configuration-driven architecture with resolution hierarchy

**Repository**: https://github.com/loopingz/webda.io
**Documentation**: https://docs.webda.io
**License**: LGPL-3.0-only
**Node Version**: >= 22.0.0

## Project Structure

```
webda.io/                      # Monorepo root (pnpm workspaces)
├── packages/                  # Framework packages (31+ packages)
│   ├── core/                 # Core framework (Application, Services, Models, Stores, `webda` CLI)
│   ├── models/               # Base model classes
│   ├── aws/                  # AWS deployers (Lambda, CloudFormation, DynamoDB, S3)
│   ├── gcp/                  # Google Cloud Platform integrations
│   ├── kubernetes/           # Kubernetes deployer
│   ├── auth/                 # Authentication services (@webda/auth)
│   ├── oauth/                # OAuth providers
│   ├── mongodb/              # MongoDB store
│   ├── postgres/             # PostgreSQL store
│   ├── elasticsearch/        # Elasticsearch integration
│   ├── graphql/              # GraphQL support
│   ├── workout/              # Logging utilities
│   ├── utils/                # Common utilities
│   ├── compiler/             # TypeScript compiler (@webda/compiler, `webdac` CLI)
│   └── ...                   # Other specialized packages
├── sample-app/               # Reference application
├── docs/                     # Documentation source
├── .github/                  # GitHub Actions CI/CD
│   └── copilot-instructions.md  # Detailed architectural rules
├── AGENTS.md                 # Quick reference for AI agents
├── CLAUDE.md                 # This file
└── sample-apps/              # Other sample applications
```

## Core Concepts

### 1. Architecture Pattern: Domain-Driven Design

**Design your Models first** → then create Services for non-model behavior → Framework auto-exposes as REST/GraphQL/CLI

```typescript
// Step 1: Define your domain model (the compiler discovers it, no decorator needed)
export class Task extends CoreModel {
  title: string;

  completed: boolean;

  owner: ModelParent<User>;
}

// Step 2: Create services for business logic (if needed)
@Bean
export class TaskNotificationService extends Service {
  async notifyTaskComplete(task: Task): Promise<void> {
    // Business logic here
  }
}

// Step 3: Framework automatically creates:
// - GET /tasks
// - POST /tasks
// - GET /tasks/{uuid}
// - PUT /tasks/{uuid}
// - DELETE /tasks/{uuid}
// - PATCH /tasks/{uuid}
```

### 2. Dependency Injection

**CRITICAL**: ALWAYS use dependency injection. NEVER manually instantiate services.

```typescript
// ✅ CORRECT: Use dependency injection for services
@Bean
export class MyService extends Service {
  @Inject("mailer")
  mailer: Mailer;

  @Inject("myQueue")
  queue: Queue;
}
// Note: for persistence, do NOT @Inject a Store — use the model directly
// (Task.create(), Task.ref(uuid).get()) or useRepository(Task). See "Repository Pattern" below.

// ❌ WRONG: Manual instantiation
const store = new MemoryStore(); // NEVER do this
```

### 3. Service Lifecycle

Services follow a strict lifecycle. Respect each phase:

1. **Constructor**: Accept the service name and parameters
2. **`resolve()`**: Dependency injection, validation, service discovery
3. **`init()`**: Async initialization (connect to databases, external services)
4. **Running**: Normal operation
5. **`stop()`**: Graceful shutdown

```typescript
@Bean
export class MyService extends Service<MyServiceParameters> {
  protected connection: DatabaseConnection;

  async resolve(): Promise<this> {
    await super.resolve();
    // Validate configuration
    // Resolve dependencies
    return this;
  }

  async init(): Promise<this> {
    await super.init();
    // Establish connections
    this.connection = await connectToDatabase(this.parameters.url);
    return this;
  }

  async stop(): Promise<void> {
    await this.connection.close();
    await super.stop();
  }
}
```

### 4. Configuration System

Configuration follows a resolution hierarchy:

**Global Config** → **Deployment Config** → **Local Element Config** → **Deployment Element Config**

```jsonc
// webda.config.jsonc (global)
{
  "$schema": "./.webda/config.schema.json",
  "version": 4,
  "services": {
    "myStore": {
      "type": "MemoryStore",
      "models": ["MyApp/MyModel"]
    }
  },
  "parameters": {
    "apiUrl": "http://localhost:18080"
  }
}

// deployments/production.json (overrides global)
{
  "$schema": "../.webda/deployment.schema.json",
  "services": {
    "myStore": {
      "type": "DynamoStore",  // Override type for production
      "table": "prod-table"
    }
  },
  "parameters": {
    "apiUrl": "https://api.example.com"
  }
}
```

### 5. Namespace Resolution

Services are auto-prefixed with the package namespace:

```typescript
// In configuration:
"type": "MyService"           → "Webda/MyService" (auto-prefixed)
"type": "MyApp/MyService"     → "MyApp/MyService" (explicit)
"type": "Beans/CustomBean"    → Bean from application

// Set namespace in package.json:
{
  "webda": {
    "namespace": "MyApp"
  }
}
```

## Development Workflows

The CLI is split between `@webda/core` (`webda` runtime: `serve`, `debug` from `@webda/debug`, `config`,
`openapi`, `migrate`, …, plus the commands declared by services with `@Command`) and `@webda/compiler`
(`webdac`: `build`, `code`).

### Essential Commands

```bash
# Project initialization
pnpm create @webda my-app           # Create new project (@webda/create)

# Development
webda debug                         # Dev server with hot reload (app on 18080, dashboard on 18181)
webda serve                         # Production-like server
webda -d deploymentName serve       # With specific deployment

# Building
pnpm -r run build                   # Build all packages (root)
pnpm run build                      # Build current package
webdac build                        # Compile TypeScript + generate webda.module.json
webdac build --watch                # Watch mode
webdac code                         # Migrate application sources to the current Webda version

# Testing
pnpm -r run test                    # Run all tests (root)
pnpm run test:all                   # Run all tests in one vitest process, no coverage (root)
pnpm run test:all --project core    # Same, for some packages only
pnpm test                           # Test current package (Vitest)
pnpm test -t "TestName"             # Run specific test
npx vitest run <absolute_path>      # Run single test file
pnpm test:watch                     # Watch mode
pnpm test:debug                     # Debug mode
pnpm test:seq                       # Sequential (no parallelism)

# Linting & Formatting
pnpm run lint                       # Check all packages
pnpm run lint:fix                   # Fix all packages
pnpm run format                     # Check formatting (Prettier)
pnpm run format:fix                 # Fix formatting

# Configuration
webda config encrypt                # Encrypt values in the configuration files

# Deployment (run by the deployer units of the deployment)
webda -d deploymentName deploy      # Deploy to environment
```

### Testing Patterns

**Framework**: Vitest (packages) + Mocha (`@webda/test`, `@webda/runtime`)

```typescript
import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "assert";

@suite
class MyServiceTest extends WebdaApplicationTest {
  @test
  async testMethod() {
    // Use this.cleanFiles to track files for automatic cleanup
    this.cleanFiles.push("/tmp/test-file.txt");

    // Register a service with resolve() and init()
    const service = await this.addService(MyService, {}, "test");

    // Assertions
    assert.strictEqual(service.getName(), "test");
  }
}
```

**Memory Logger**: `WebdaTest` wraps each test (`@testWrapper` from `@webda/test`) and exports its logs to `.webda/tests/<suite>/<test>.log` on failure (or always with `WEBDA_TEST_LOGS`).

## Code Style & Conventions

### TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with `"type": "module"` in package.json
- **Decorators**: Use modern decorators (`experimentalDecorators: false`)
- **Strict Mode**: Implicit in ES modules — do not add `"use strict"` (ESLint `strict` reports it as unnecessary)
- **Output**: `lib/` directory
- **Source Maps**: Enabled

### Naming Conventions

- **Classes**: PascalCase (e.g., `MyService`, `TaskModel`)
- **Methods/Variables**: camelCase (e.g., `getUserById`, `taskList`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces**: PascalCase with descriptive names (e.g., `ServiceParameters`)
- **Files**: Models live in `*.model.ts`, services, beans and deployers in `*.service.ts`, flows in `*.flow.ts` — the content mapper only processes those files and reports a naming violation otherwise (e.g. `task.model.ts`, `my.service.ts`)

### Code Style Rules

```typescript
// 1. Always use function names (ESLint: func-names)
const myFunc = function myFunc() {  // ✅ Named
  // ...
};

// 2. No "use strict": ES modules are strict already, and ESLint rejects the directive

// 3. Prefer ESM imports
import { Service } from "@webda/core";  // ✅
const { Service } = require("@webda/core");  // ❌

// 4. Log with the level first: this.log() in a service, useLog() from @webda/workout elsewhere
this.log("INFO", "Message", { context: "data" });
import { useLog } from "@webda/workout";
useLog("WARN", "Message outside a service");

// 5. Throw WebdaError subclasses
import { WebdaError } from "@webda/core";
throw new WebdaError.BadRequest("Invalid input");
throw new WebdaError.NotFound("Resource not found");
throw new WebdaError.Unauthorized("Not authorized");

// 6. Use type annotations for public APIs
public async getUser(id: string): Promise<User> {
  // ...
}

// 7. Prefer dependency injection over imports
@Inject("serviceName")  // ✅
serviceName: MyService;

import { myService } from "./my-service";  // ❌ Don't import service instances
```

### Prettier Configuration

```json
{
  "tabWidth": 2,
  "printWidth": 120,
  "trailingComma": "none",
  "arrowParens": "avoid"
}
```

### ESLint Rules

- `no-explicit-any`: OFF (TypeScript any is allowed)
- `no-unused-vars`: OFF (handled by unused-imports plugin)
- `func-names`: ERROR (must name functions)
- `strict`: ERROR (flags a redundant `"use strict"` in ES modules)

## Service Development

### Service Template

```typescript
import { Bean, Service, ServiceParameters } from "@webda/core";

/**
 * The compiler (`webdac build`) generates the configuration schema and the
 * webda.module.json entry from this class and its JSDoc
 */
export class MyServiceParameters extends ServiceParameters {
  setting1: string;
  /**
   * @default 10
   */
  setting2?: number;
}

@Bean
export class MyService extends Service<MyServiceParameters> {
  /**
   * Resolve dependencies and validate configuration
   */
  async resolve(): Promise<this> {
    await super.resolve();

    if (!this.parameters.setting1) {
      throw new Error("setting1 is required");
    }

    return this;
  }

  /**
   * Initialize async resources
   */
  async init(): Promise<this> {
    await super.init();
    this.log("INFO", "Service initialized", { setting1: this.parameters.setting1 });
    return this;
  }

  /**
   * Cleanup resources
   */
  async stop(): Promise<void> {
    this.log("INFO", "Service stopping");
    await super.stop();
  }
}
```

### Model Template

```typescript
import { Action, CoreModel, OperationContext } from "@webda/core";
import { ModelRelated } from "@webda/models";

// The compiler discovers models and generates their schema from the TypeScript types
export class MyModel extends CoreModel {
  name: string;

  description?: string;

  createdAt: Date;

  // OtherModel declares `owner: ModelParent<MyModel>`
  items: ModelRelated<OtherModel, MyModel, "owner">;

  /**
   * Custom action exposed as POST /mymodels/{uuid}/customAction
   */
  @Action({
    methods: ["POST"],
    openapi: {
      description: "Perform custom action"
    }
  })
  async customAction(ctx: OperationContext): Promise<void> {
    // Action logic
  }
}
```

## Common Patterns

### 1. Repository Pattern (Database Abstraction)

Repositories are the canonical persistence API. Each model class has exactly one Repository, produced and registered by a Store service that owns the underlying backend.

```typescript
// Define stores in configuration — internal infrastructure
{
  "services": {
    "db": {
      "type": "MemoryStore",  // or DynamoStore, MongoStore, PostgresStore, SQLiteStore, FileStore
      "models": ["MyApp/Task", "MyApp/User"]
    }
  }
}

// In app code — never reference the store, use the model
@Bean
export class TaskService extends Service {
  async getTask(uuid: string): Promise<Task> {
    return Task.ref(uuid).get();
  }

  async createTask(data: Partial<Task>): Promise<Task> {
    return Task.create(data);
  }

  async findOpenTasks(): Promise<Task[]> {
    const result = await Task.query("status = 'open'");
    return result.results;
  }

  // Need the Repository directly (e.g. to register a listener)?
  async onTaskCreated(): Promise<void> {
    useRepository(Task).on("Created", evt => {
      /* react to evt.object_id / evt.object */
    });
  }
}
```

> **Stores are internal.** App code uses `Model.ref/create/query` or `useRepository(Model)`. `@Inject("storeName")` for stores is deprecated for app code; the `Store` class and `StoreParameters` are `@internal`. Repository typed events (`Created`/`Updated`/`Patched`/`Deleted`/`PartialUpdated`) are reached via `useRepository(Model).on(...)`.

### 2. Event Pattern

```typescript
// Services are async event emitters, events are typed by the service second generic
// Emit events
await this.emit("task.created", { task });

// Listen to events
this.on("task.created", async evt => {
  await this.notifyUser(evt.task.owner);
});

// Model persistence events: see useRepository(Model).on(...) above
```

### 3. Queue Pattern

```typescript
// Define queue in configuration
{
  "services": {
    "taskQueue": {
      "type": "MemoryQueue"  // or SQSQueue, etc.
    }
  }
}

// Consume the queue (e.g. in a service init())
this.getService("taskQueue").consume(async message => {
  // Process message.taskId
});

// Send to queue
await this.getService("taskQueue").sendMessage({ taskId: "123" });
```

### 4. Binary/File Upload Pattern

```typescript
export class Document extends CoreModel {
  title: string;

  file: Binary; // or Binaries for a list of files
}

// Configuration
{
  "services": {
    "documentStore": {
      "type": "FileStore",
      "models": ["MyApp/Document"],
      "folder": "./uploads"
    },
    "binaryService": {
      "type": "FileBinary",  // or S3Binary
      "folder": "./uploads/binaries",
      "models": { "MyApp/Document": ["file"] }
    }
  }
}
```

### 5. Mailer Pattern

```typescript
@Bean
export class NotificationService extends Service {
  @Inject("mailer")
  mailer: Mailer;

  async sendWelcomeEmail(user: User): Promise<void> {
    await this.mailer.send({
      to: user.email,
      template: "welcome",
      replacements: { name: user.name }
    });
  }
}
```

## File Handling Rules

### DO NOT Edit Generated Files

Never modify these generated files:

- `lib/**/*` - Compiled output
- `webda.module.json` - Auto-generated module metadata
- `*.schema.json` - Auto-generated JSON schemas
- `reports/**/*` - Test output
- `coverage/**/*` - Coverage reports

### File Paths

- **Always use absolute paths** when working with tools
- Source files are in `src/`
- Compiled output goes to `lib/`
- Tests use `.spec.ts` suffix

## Deployment Architecture

### Deployment Structure

```
my-project/
├── webda.config.jsonc        # Global configuration
├── deployments/               # Deployment-specific configs
│   ├── development.json
│   ├── staging.json
│   └── production.json
└── packages/
    └── my-app/
        └── src/
```

### Cloud Deployers

1. **AWS CloudFormation**: Full infrastructure deployment
2. **AWS Lambda**: Serverless functions
3. **Kubernetes**: Container orchestration
4. **Docker**: Container packaging

### Deployment Example

```bash
# Deploy to production
webda -d production deploy

# Deploy specific unit
webda -d production deploy --service=webapp
```

## Best Practices

### ✅ DO

1. **Use dependency injection** for all services
2. **Respect service lifecycle** (resolve → init → running → stop)
3. **Use configuration parameters** instead of hardcoding
4. **Write tests** for all services and models
5. **Use WebdaError subclasses** for error handling
6. **Use useLog from @webda/workout** for logging
7. **Follow DDD principles** - Models first, Services for cross-cutting concerns
8. **Use @testWrapper decorator** for tests with automatic logging
9. **Add JSDoc comments** for public APIs
10. **Use TypeScript types** for better IDE support
11. **Read existing files** before modifying them
12. **Run tests** after making changes

### ❌ DON'T

1. **Don't manually instantiate services** - use DI
2. **Don't bypass Application class** - it handles module loading
3. **Don't ignore resolve/init lifecycle** - services may not be ready
4. **Don't hardcode configuration** - use parameters
5. **Don't mix deployment concerns in service code** - use deployers
6. **Don't edit generated files** (_.schema.json, webda.module.json, lib/_)
7. **Don't modify package.json or tsconfig.json** unless explicitly requested
8. **Don't use console.log** - use useLog from @webda/workout
9. **Don't create unnecessary abstractions** - keep it simple
10. **Don't add features not requested** - focus on requirements
11. **Don't use npx** - local package.json scripts should be enough

## Error Handling

### Standard Error Classes

```typescript
import { WebdaError } from "@webda/core";

// Common errors
throw new WebdaError.BadRequest("Invalid input");
throw new WebdaError.NotFound("Resource not found");
throw new WebdaError.Unauthorized("Not authorized");
throw new WebdaError.Forbidden("Access denied");
throw new WebdaError.Conflict("Resource already exists");
throw new WebdaError.CodeError("CUSTOM_CODE", "Custom error message");
```

### Context-Aware Errors

```typescript
// In HTTP context
ctx.statusCode(400);
throw new WebdaError.BadRequest("Invalid request");

// Will return proper HTTP response
```

## Monorepo Management

### pnpm Workspaces

- **pnpm Workspaces**: Package management, build orchestration, and publishing (`pnpm-workspace.yaml`)

### Package Dependencies

Packages depend on each other:

```json
{
  "dependencies": {
    "@webda/core": "^4.0.0-beta.1",
    "@webda/models": "^4.0.0-beta.1"
  }
}
```

### Build Order

pnpm resolves build order based on the workspace dependency graph:

```
@webda/utils → @webda/workout → @webda/core → @webda/models → ...
```

## Contributing

### Pull Request Requirements

1. **Build successfully**: `pnpm run build`
2. **Pass all tests**: `pnpm test`
3. **Follow conventional commits**: `feat:`, `fix:`, `docs:`, etc.
4. **Lint clean**: `pnpm run lint`
5. **Format clean**: `pnpm run format`
6. **Approved by maintainer**

### Local Testing with Other Projects

```bash
# In webda.io root
pnpm link --global

# In your project
pnpm link --global @webda/core
pnpm link --global @webda/compiler
# ... link other packages as needed
```

### Release Process

```bash
pnpm run new-version  # Bumps versions, creates tags
pnpm -r publish       # Publishes to npm
```

## Integration Patterns

### GraphQL

```typescript
import { GraphQLService } from "@webda/graphql";

// Automatically generates GraphQL schema from models
{
  "services": {
    "graphql": {
      "type": "GraphQLService",
      "url": "/graphql",
      "models": ["MyApp/Task", "MyApp/User"]
    }
  }
}
```

### Authentication

```typescript
import { Authentication, EmailPasswordProvider } from "@webda/auth";

// Authentication holds the shared logic, each login method is a provider service
{
  "services": {
    "Authentication": {
      "type": "Webda/Authentication",
      "linking": "verified"
    },
    "emailAuth": {
      "type": "Webda/EmailPasswordProvider",
      "mailer": "Mailer",
      "verification": "before"
    }
  }
}
```

### OpenTelemetry

```typescript
import { OtelService } from "@webda/otel";

// Add observability
{
  "services": {
    "otel": {
      "type": "OtelService",
      "traceExporter": { "type": "otlp", "sampling": 0.1 }
    }
  }
}
```

## Debugging

### VS Code Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Webda",
  "program": "${workspaceFolder}/node_modules/.bin/webda",
  "args": ["debug"],
  "cwd": "${workspaceFolder}",
  "console": "integratedTerminal"
}
```

### Debug Mode

```bash
webda debug  # Starts the app on port 18080 with hot reload, debug dashboard on 18181
```

## Resources

- **Main Documentation**: https://docs.webda.io
- **GitHub Repository**: https://github.com/loopingz/webda.io
- **GitHub Issues**: https://github.com/loopingz/webda.io/issues
- **Gitter Chat**: https://gitter.im/loopingz/webda
- **Sample Application**: [sample-app/](sample-app/)

## Quick Reference: File Locations

| Purpose         | Location                       |
| --------------- | ------------------------------ |
| Core framework  | `packages/core/src/`           |
| CLI tools       | `packages/core/src/bin/`, `packages/compiler/src/` |
| Models          | `packages/models/src/`         |
| AWS integration | `packages/aws/src/`            |
| Tests           | `packages/*/src/**/*.spec.ts`  |
| Compiled output | `packages/*/lib/`              |
| Module metadata | `packages/*/webda.module.json` |
| Documentation   | `docs/`                        |
| Examples        | `sample-app/`                  |

---

**Last Updated**: 2026-11-22
**Framework Version**: 4.0.0-rc.1
**Maintainer**: Loopingz (@loopingz)
