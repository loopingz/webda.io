# Webda.io Copilot Instructions

## Framework Overview

Webda.io is a Domain-Driven Design framework with dependency injection, multi-database abstraction, and cloud-native deployment strategies. It supports Lambda/APIGateway, Kubernetes, and traditional deployments.

**Core Architecture Pattern**: Design your `Models` first with their actions and permissions, then create `Services` for non-model-specific behavior. The framework exposes everything as REST API, GraphQL, or CommandLine.

## Project Structure

```
webda.io/                   # Monorepo root
├── packages/               # Framework packages
│   ├── core/              # Core framework (Application, Services, Models)
│   ├── shell/             # CLI tools and deployment
│   ├── aws/               # AWS deployers and services
│   ├── models/            # Base model definitions
│   └── [other packages]   # Specialized functionality
├── sample-app/            # Example application
└── deployments/           # Deployment configurations
```

**Key Concepts**:
- **Application**: Central class that loads configuration, modules, and coordinates services
- **Services**: Business logic components with dependency injection
- **Models**: Domain entities with automatic REST/GraphQL exposure
- **Deployers**: Infrastructure-as-code for various cloud platforms
- **Configuration Resolution**: Global → Deployment → Local → Deployment-specific overrides

## Development Workflows

### Essential Commands
```bash
# Initialize new project
npx @webda/shell init

# Development server with hot reload
webda debug                    # Port 18080 with TypeScript compilation
webda serve                    # Production-like serving
webda -d deploymentName serve  # With specific deployment config

# Code generation
yarn new-module     # Create new package in monorepo
yarn new-service    # Generate service boilerplate
yarn new-model      # Generate domain model

# Building and testing
nx run-many --target=build     # Build all packages
nx run-many --target=test      # Run all tests
yarn build:ci                  # CI-specific build

# Deployment management
webda config                   # Open configuration UI
webda -d deploymentName deploy # Deploy to specific environment
webda new-deployment          # Create deployment configuration
```

### Configuration System

**webda.config.jsonc** is the heart of the application:
```jsonc
{
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "imports": ["./webda.import.jsonc"],  // Modular config loading
  "services": {
    "myStore": {
      "model": "MyApp/MyModel",
      "type": "MemoryStore"           // Auto-resolves to Webda/MemoryStore
    }
  },
  "parameters": {
    "apiUrl": "http://localhost:18080"
  }
}
```

**Default Services** (automatically created):
- `Registry`: Configuration storage (MemoryStore with .registry persistence)
- `CryptoService`: Key management with auto-rotation
- `SessionManager`: Cookie-based sessions
- `Router`: HTTP routing

## Build System & Architecture

### Monorepo with Nx + Lerna
- **Nx**: Handles build dependencies and caching (`nx.json`)
- **Lerna**: Manages package versioning and publishing
- **Target Dependencies**: `build` → `test` → `build:module`

### Custom Compiler (`@webda/compiler`)
```bash
webdac build          # Compile TypeScript + generate webda.module.json
webdac build --watch  # Watch mode for development
```

**Key Files**:
- `webda.module.json`: Generated metadata for services/models
- `tsconfig.json`: Standard TypeScript configuration
- Package builds to `lib/` directory

### Testing Patterns
**Framework**: Vitest (packages) + Mocha (shell/legacy)

```typescript
import { WebdaTest } from "@webda/core/test";

class MyTest extends WebdaTest {
  @testWrapper  // Automatic memory logging on failure
  async testMethod() {
    // Test implementation
    // this.cleanFiles tracks files for cleanup
  }
}
```

**Memory Logger**: Automatically exports logs on test failure to `reports/` directory

Run tests with:
```bash
yarn test               # All tests
yarn test -t "MyTest"   # Specific test
```

## Service Development Patterns

### Service Definition
```typescript
@Bean
export class MyService extends Service<MyServiceParameters> {
  static getModda(): any {
    return {
      uuid: "MyApp/MyService",
      label: "My Service",
      description: "Service description",
      documentation: "https://docs.example.com",
      logo: "images/logo.png"
    };
  }

  async resolve() {
    await super.resolve();
    // Service initialization logic
  }
}
```

### Model Definition
```typescript
@Model()
export class MyModel extends CoreModel {
  @Expose()
  name: string;

  @ModelRelated("OtherModel", "owner")
  items: ModelRelation<OtherModel>;

  // Automatic REST endpoints generated
  // GET/POST/PUT/DELETE /mymodels/{id}
}
```

## Deployment Architecture

### Deployment Configuration
`deployments/{name}.json`:
```json
{
  "$schema": "../.webda-deployment-schema.json",
  "units": [
    { "name": "webapp", "type": "CloudFormation" }
  ],
  "parameters": {
    "apiUrl": "https://api.example.com"
  },
  "services": {
    "myStore": {
      "type": "DynamoStore",
      "table": "prod-table"
    }
  }
}
```

### Cloud Deployers
- **CloudFormation**: AWS infrastructure deployment
- **Kubernetes**: Container orchestration
- **Lambda**: Serverless functions

## Critical Conventions

### Namespace Resolution
```typescript
// In configuration, these are equivalent:
"MyService"           → "Webda/MyService" (auto-prefixed)
"MyApp/MyService"     → "MyApp/MyService" (explicit)
"Beans/MyBean"        → Bean from application
```

### Service Lifecycle
1. **Creation**: Constructor with parameters
2. **Resolution**: `resolve()` - dependency injection, validation
3. **Initialization**: `init()` - async startup
4. **Running**: Normal operation
5. **Cleanup**: `stop()` - graceful shutdown

### Configuration Service Pattern
Optional dynamic configuration loading:
```typescript
// Enabled by setting parameters.configurationService
this.configuration.parameters.configurationService = "MyConfigService";
```

### Error Handling
```typescript
import * as WebdaError from "@webda/core/errors";
throw new WebdaError.BadRequestError("Invalid input");
```

## Dependencies and Integration

### Core Dependencies
- **@webda/core**: Framework foundation
- **@webda/models**: Base model classes  
- **@webda/workout**: Logging and utilities
- **@webda/utils**: File operations, utilities

### External Integration Points
- **AWS SDK**: CloudFormation, Lambda, DynamoDB, S3
- **Kubernetes Client**: Container deployment
- **JSON Schema**: Configuration validation
- **TypeScript**: Primary language with decorators

## Anti-patterns to Avoid

- **Don't** manually instantiate services - use dependency injection
- **Don't** hardcode configuration - use parameters system
- **Don't** bypass the Application class - it handles module loading
- **Don't** ignore the resolve/init lifecycle - services may not be ready
- **Don't** mix deployment concerns in service code - use deployers

This framework emphasizes convention over configuration, automatic REST API generation from models, and infrastructure-as-code deployment strategies.
