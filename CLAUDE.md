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
│   ├── core/                 # Core framework (Application, Services, Models, Stores)
│   ├── shell/                # CLI tools (webda command)
│   ├── models/               # Base model classes
│   ├── aws/                  # AWS deployers (Lambda, CloudFormation, DynamoDB, S3)
│   ├── gcp/                  # Google Cloud Platform integrations
│   ├── kubernetes/           # Kubernetes deployer
│   ├── authentication/       # Authentication services
│   ├── oauth/                # OAuth providers
│   ├── mongodb/              # MongoDB store
│   ├── postgres/             # PostgreSQL store
│   ├── elasticsearch/        # Elasticsearch integration
│   ├── graphql/              # GraphQL support
│   ├── workout/              # Logging utilities
│   ├── utils/                # Common utilities
│   ├── compiler/             # TypeScript compiler (@webda/compiler)
│   └── ...                   # Other specialized packages
├── sample-app/               # Reference application
├── docs/                     # Documentation source
├── .github/                  # GitHub Actions CI/CD
│   └── copilot-instructions.md  # Detailed architectural rules
├── AGENTS.md                 # Quick reference for AI agents
├── CLAUDE.md                 # This file
└── webda.config.json         # Root configuration (for testing/development)
```

## Core Concepts

### 1. Architecture Pattern: Domain-Driven Design

**Design your Models first** → then create Services for non-model behavior → Framework auto-exposes as REST/GraphQL/CLI

```typescript
// Step 1: Define your domain model
@Model()
export class Task extends CoreModel {
  @Expose()
  title: string;

  @Expose()
  completed: boolean;

  @ModelRelated("User", "tasks")
  owner: ModelRelation<User>;
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
// ✅ CORRECT: Use dependency injection
@Bean
export class MyService extends Service {
  @Inject("myStore")
  store: Store;

  @Inject("mailer")
  mailer: Mailer;
}

// ❌ WRONG: Manual instantiation
const store = new MemoryStore(); // NEVER do this
```

### 3. Service Lifecycle

Services follow a strict lifecycle. Respect each phase:

1. **Constructor**: Accept `WebdaApplication` and parameters
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
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "services": {
    "myStore": {
      "type": "MemoryStore",
      "model": "MyApp/MyModel"
    }
  },
  "parameters": {
    "apiUrl": "http://localhost:18080"
  }
}

// deployments/production.json (overrides global)
{
  "$schema": "../.webda-deployment-schema.json",
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

### Essential Commands

```bash
# Project initialization
npx @webda/shell init              # Create new project

# Development
webda debug                         # Dev server with hot reload (port 18080)
webda serve                         # Production-like server
webda -d deploymentName serve       # With specific deployment

# Code generation
pnpm new-module                     # Create new package in monorepo
pnpm new-service                    # Generate service boilerplate
pnpm new-model                      # Generate domain model

# Building
pnpm -r run build                   # Build all packages (root)
pnpm run build                      # Build current package
webdac build                        # Compile TypeScript + generate webda.module.json
webdac build --watch                # Watch mode

# Testing
pnpm -r run test                    # Run all tests (root)
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
webda config                        # Open configuration UI
webda new-deployment               # Create deployment config

# Deployment
webda -d deploymentName deploy      # Deploy to environment
```

### Testing Patterns

**Framework**: Vitest (packages) + Mocha (shell/legacy)

```typescript
import { WebdaTest } from "@webda/core/test";
import { testWrapper } from "@webda/workout";

class MyServiceTest extends WebdaTest {
  @testWrapper // Automatic memory logging on failure
  async testMethod() {
    // Use this.cleanFiles to track files for automatic cleanup
    this.cleanFiles.push("/tmp/test-file.txt");

    // Test implementation
    const service = await this.registerService(new MyService(this.webda, "test", {}));
    await service.init();

    // Assertions
    assert.strictEqual(service.getName(), "test");
  }
}
```

**Memory Logger**: Automatically exports logs to `reports/` directory on test failure.

## Code Style & Conventions

### TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with `"type": "module"` in package.json
- **Decorators**: Use modern decorators (`experimentalDecorators: false`)
- **Strict Mode**: Enabled at file level with `"use strict"`
- **Output**: `lib/` directory
- **Source Maps**: Enabled

### Naming Conventions

- **Classes**: PascalCase (e.g., `MyService`, `TaskModel`)
- **Methods/Variables**: camelCase (e.g., `getUserById`, `taskList`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces**: PascalCase with descriptive names (e.g., `ServiceParameters`)
- **Files**: Match class names (e.g., `my-service.ts` for `MyService`)

### Code Style Rules

```typescript
// 1. Always use function names (ESLint: func-names)
const myFunc = function myFunc() {  // ✅ Named
  // ...
};

// 2. Use strict mode at file level
"use strict";  // At top of file

// 3. Prefer ESM imports
import { Service } from "@webda/core";  // ✅
const { Service } = require("@webda/core");  // ❌

// 4. Use logging from @webda/workout
import { useLog } from "@webda/workout";
const log = useLog("MyService");
log.info("Message", { context: "data" });

// 5. Throw WebdaError subclasses
import * as WebdaError from "@webda/core/errors";
throw new WebdaError.BadRequestError("Invalid input");
throw new WebdaError.NotFoundError("Resource not found");
throw new WebdaError.UnauthorizedError("Not authorized");

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
- `strict`: ERROR (global strict mode required)

## Service Development

### Service Template

```typescript
import { Service, ServiceParameters } from "@webda/core";
import { Bean } from "@webda/decorators";
import { useLog } from "@webda/workout";

interface MyServiceParameters extends ServiceParameters {
  setting1: string;
  setting2?: number;
}

@Bean
export class MyService extends Service<MyServiceParameters> {
  protected log = useLog("MyService");

  /**
   * Get Modda metadata for service discovery
   */
  static getModda(): any {
    return {
      uuid: "MyApp/MyService",
      label: "My Service",
      description: "Service description",
      documentation: "https://docs.example.com/my-service",
      logo: "images/icons/my-service.png",
      configuration: {
        default: {
          setting2: 10
        },
        schema: {
          type: "object",
          properties: {
            setting1: { type: "string" },
            setting2: { type: "number" }
          },
          required: ["setting1"]
        }
      }
    };
  }

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
    this.log.info("Service initialized", { setting1: this.parameters.setting1 });
    return this;
  }

  /**
   * Cleanup resources
   */
  async stop(): Promise<void> {
    this.log.info("Service stopping");
    await super.stop();
  }
}
```

### Model Template

```typescript
import { CoreModel, Model, Expose } from "@webda/core";
import { ModelRelation, ModelRelated } from "@webda/core";

@Model()
export class MyModel extends CoreModel {
  @Expose()
  name: string;

  @Expose()
  description?: string;

  @Expose()
  createdAt: Date;

  @ModelRelated("OtherModel", "owner")
  items: ModelRelation<OtherModel>;

  /**
   * Custom validation
   */
  async validate(ctx?: any): Promise<void> {
    await super.validate(ctx);

    if (!this.name?.trim()) {
      throw new Error("Name cannot be empty");
    }
  }

  /**
   * Custom action exposed as POST /mymodels/{uuid}/customAction
   */
  @Action({
    methods: ["POST"],
    openapi: {
      description: "Perform custom action"
    }
  })
  async customAction(ctx: WebContext): Promise<void> {
    // Action logic
  }
}
```

## Common Patterns

### 1. Store Pattern (Database Abstraction)

```typescript
// Define store in configuration
{
  "services": {
    "taskStore": {
      "type": "MemoryStore",  // or DynamoStore, MongoStore, PostgresStore
      "model": "MyApp/Task"
    }
  }
}

// Use in service
@Bean
export class TaskService extends Service {
  @Inject("taskStore")
  store: Store<Task>;

  async getTask(uuid: string): Promise<Task> {
    return this.store.get(uuid);
  }

  async createTask(data: Partial<Task>): Promise<Task> {
    const task = new Task();
    Object.assign(task, data);
    await this.store.save(task);
    return task;
  }
}
```

### 2. Event Pattern

```typescript
import { Event } from "@webda/core";

// Emit events
this.emit("task.created", { task });

// Listen to events
this.on("task.created", async (evt: Event) => {
  const { task } = evt.data;
  await this.notifyUser(task.owner);
});

// Use @On decorator
@Bean
export class TaskNotificationService extends Service {
  @On("Store.Save:MyApp/Task")
  async onTaskSaved(event: Event): Promise<void> {
    const task = event.data.object as Task;
    // Handle task save event
  }
}
```

### 3. Queue Pattern

```typescript
// Define queue in configuration
{
  "services": {
    "taskQueue": {
      "type": "MemoryQueue",  // or SQSQueue, etc.
      "worker": "TaskWorker"
    }
  }
}

// Queue worker
@Bean
export class TaskWorker extends QueueWorker {
  async work(message: QueueMessage): Promise<void> {
    const task = message.data;
    // Process task
  }
}

// Send to queue
await this.getService<Queue>("taskQueue").sendMessage({ taskId: "123" });
```

### 4. Binary/File Upload Pattern

```typescript
@Model()
export class Document extends CoreModel {
  @Expose()
  title: string;

  @BinaryMap({ cardinality: "ONE" })
  file: BinaryFile;
}

// Configuration
{
  "services": {
    "documentStore": {
      "type": "FileStore",
      "model": "MyApp/Document",
      "folder": "./uploads"
    },
    "binaryService": {
      "type": "FileBinary",  // or S3Binary
      "folder": "./uploads/binaries"
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
      data: { name: user.name }
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
webda -d production deploy webapp
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
import * as WebdaError from "@webda/core/errors";

// Common errors
throw new WebdaError.BadRequestError("Invalid input");
throw new WebdaError.NotFoundError("Resource not found");
throw new WebdaError.UnauthorizedError("Not authorized");
throw new WebdaError.ForbiddenError("Access denied");
throw new WebdaError.ConflictError("Resource already exists");
throw new WebdaError.CodeError("CUSTOM_CODE", "Custom error message");
```

### Context-Aware Errors

```typescript
// In HTTP context
ctx.statusCode(400);
throw new WebdaError.BadRequestError("Invalid request");

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
pnpm link --global @webda/shell
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
import { Authentication } from "@webda/authentication";

// Configure authentication
{
  "services": {
    "auth": {
      "type": "Authentication",
      "providers": {
        "google": {
          "type": "GoogleOAuth",
          "clientId": "${GOOGLE_CLIENT_ID}",
          "clientSecret": "${GOOGLE_CLIENT_SECRET}"
        }
      }
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
      "serviceName": "my-app",
      "endpoint": "http://localhost:4318"
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
webda debug  # Starts on port 18080 with hot reload
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
| CLI tools       | `packages/shell/src/`          |
| Models          | `packages/models/src/`         |
| AWS integration | `packages/aws/src/`            |
| Tests           | `packages/*/src/**/*.spec.ts`  |
| Compiled output | `packages/*/lib/`              |
| Module metadata | `packages/*/webda.module.json` |
| Documentation   | `docs/`                        |
| Examples        | `sample-app/`                  |

---

**Last Updated**: 2026-01-25
**Framework Version**: 4.0.0-beta.1
**Maintainer**: Loopingz (@loopingz)
