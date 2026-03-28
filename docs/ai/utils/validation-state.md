---
sidebar_position: 6
title: Validation & State
description: Input validation, state tracking, and utility functions
---

# Validation & State

This guide covers utilities for validation and state management: regex-based validation, state tracking decorators, UUID generation, and other helper utilities.

## Regular Expression Validation

Flexible string validation using regex patterns and exact matches.

### RegExpValidator

Validate strings against one or more regex patterns.

#### Class Definition

```typescript
class RegExpValidator {
  constructor(info: string | string[]);

  validate(value: string): boolean;
  static getRegExp(reg: string): RegExp;
}
```

#### Basic Usage

```typescript
import { RegExpValidator } from '@webda/utils';

// Single pattern
const emailValidator = new RegExpValidator("^[\\w.]+@\\w+\\.\\w+$");

console.log(emailValidator.validate("user@example.com"));  // true
console.log(emailValidator.validate("invalid"));            // false

// Multiple patterns (OR logic)
const validator = new RegExpValidator([
  "^\\d{3}-\\d{4}$",      // Phone: 123-4567
  "^[a-z]+@[a-z]+\\.[a-z]+$"  // Email: user@example.com
]);

console.log(validator.validate("123-4567"));         // true
console.log(validator.validate("user@example.com")); // true
console.log(validator.validate("invalid"));          // false
```

#### Auto-Added Anchors

Patterns automatically get `^` and `$` anchors if not present:

```typescript
const validator = new RegExpValidator("\\d+");

// Internally becomes: /^\d+$/
console.log(validator.validate("123"));    // true
console.log(validator.validate("abc123")); // false (must match entire string)
```

### RegExpStringValidator

Combine exact string matches with regex patterns.

#### Class Definition

```typescript
class RegExpStringValidator extends RegExpValidator {
  constructor(info: string | string[]);

  validate(value: string): boolean;
}
```

#### Basic Usage

```typescript
import { RegExpStringValidator } from '@webda/utils';

const validator = new RegExpStringValidator([
  "admin",                    // Exact match
  "superuser",                // Exact match
  "regex:^user-\\d+$",        // Regex pattern (must start with "regex:")
  "regex:^guest-[a-z0-9]+$"   // Another regex pattern
]);

// Exact matches
console.log(validator.validate("admin"));      // true
console.log(validator.validate("superuser")); // true

// Regex matches
console.log(validator.validate("user-123"));   // true
console.log(validator.validate("guest-abc"));  // true

// No match
console.log(validator.validate("invalid"));    // false
```

#### Pattern Syntax

- **Exact Match**: String without prefix → `"admin"`
- **Regex Pattern**: String with `regex:` prefix → `"regex:^pattern$"`

```typescript
const validator = new RegExpStringValidator([
  "exact-match",           // Matches only "exact-match"
  "regex:^prefix-.*$",     // Matches "prefix-anything"
  "regex:^\\d{3}$"         // Matches exactly 3 digits
]);
```

### Common Use Cases

#### URL Validation

```typescript
class RouteValidator {
  private validator: RegExpStringValidator;

  constructor(allowedRoutes: string[]) {
    this.validator = new RegExpStringValidator(allowedRoutes);
  }

  isAllowed(url: string): boolean {
    return this.validator.validate(url);
  }
}

const routes = new RouteValidator([
  "/public",
  "/about",
  "/contact",
  "regex:^/api/v\\d+/.*$",      // /api/v1/..., /api/v2/...
  "regex:^/users/[0-9a-f-]+$"   // /users/{uuid}
]);

console.log(routes.isAllowed("/public"));           // true
console.log(routes.isAllowed("/api/v1/users"));     // true
console.log(routes.isAllowed("/users/550e8400")); // true
console.log(routes.isAllowed("/admin"));            // false
```

#### Configuration Validation

```typescript
interface ServiceConfig {
  urls: string[];
}

class MyService {
  private urlValidator: RegExpStringValidator;

  constructor(config: ServiceConfig) {
    this.urlValidator = new RegExpStringValidator(config.urls);
  }

  canAccess(url: string): boolean {
    return this.urlValidator.validate(url);
  }
}

const service = new MyService({
  urls: [
    "https://api.example.com",
    "https://cdn.example.com",
    "regex:^https://.*\\.amazonaws\\.com/.*$"
  ]
});

console.log(service.canAccess("https://api.example.com"));     // true
console.log(service.canAccess("https://s3.amazonaws.com/bucket")); // true
console.log(service.canAccess("http://evil.com"));             // false
```

#### Permission Validation

```typescript
class PermissionChecker {
  private validator: RegExpStringValidator;

  constructor(allowedPatterns: string[]) {
    this.validator = new RegExpStringValidator(allowedPatterns);
  }

  hasPermission(resource: string): boolean {
    return this.validator.validate(resource);
  }
}

const checker = new PermissionChecker([
  "users:read",
  "users:write",
  "regex:^posts:\\w+$",          // posts:read, posts:write, etc.
  "regex:^admin:.*$"             // All admin permissions
]);

console.log(checker.hasPermission("users:read"));   // true
console.log(checker.hasPermission("posts:delete")); // true
console.log(checker.hasPermission("admin:all"));    // true
console.log(checker.hasPermission("secret:read"));  // false
```

#### Environment Variable Validation

```typescript
const validator = new RegExpStringValidator([
  "development",
  "staging",
  "production",
  "regex:^test-.*$"  // test-1, test-feature-x, etc.
]);

const env = process.env.NODE_ENV || "development";

if (!validator.validate(env)) {
  throw new Error(`Invalid environment: ${env}`);
}
```

## State Management

Track method execution states with decorators.

### @State Decorator

Automatically track state transitions in class methods.

#### Decorator Definition

```typescript
interface StateOptions<S extends string = string> {
  start?: S;   // State when method starts
  end?: S;     // State when method completes successfully
  error?: S;   // State when method throws error
}

function State<E extends string = string>(
  options?: StateOptions<E>
): MethodDecorator;
```

#### Static Methods

```typescript
State.getCurrentState(target: any): string;
State.getStateStatus(target: any): StateStatus;

interface StateStatus {
  state: string;
  lastTransition?: number;
  transitions: Array<{
    step: string;
    duration: number;
    exception?: any;
    startTime: number;
    endTime: number;
  }>;
  updateState(newState: string, exception?: any): void;
}
```

### Basic Usage

```typescript
import { State } from '@webda/utils';

class DataProcessor {
  @State({
    start: "processing",
    end: "complete",
    error: "failed"
  })
  async processData(data: any): Promise<any> {
    // Your processing logic
    await this.transform(data);
    await this.validate(data);
    return data;
  }
}

const processor = new DataProcessor();
await processor.processData({ name: "test" });

// Check current state
const state = State.getCurrentState(processor);
console.log(state);  // "complete"
```

### State Transitions

Track all state transitions with timing:

```typescript
class Worker {
  @State({
    start: "working",
    end: "done",
    error: "error"
  })
  async work() {
    await doWork();
  }
}

const worker = new Worker();
await worker.work();

// Get detailed status
const status = State.getStateStatus(worker);

console.log(status.state);  // "done"
console.log(status.transitions);
// [
//   {
//     step: "initial",
//     duration: 0,
//     startTime: 1234567890000,
//     endTime: 1234567890000
//   },
//   {
//     step: "working",
//     duration: 1523,
//     startTime: 1234567890000,
//     endTime: 1234567891523
//   }
// ]
```

### Error Handling

Track error states:

```typescript
class RiskyOperation {
  @State({
    start: "attempting",
    end: "succeeded",
    error: "failed"
  })
  async riskyMethod() {
    throw new Error("Something went wrong");
  }
}

const op = new RiskyOperation();

try {
  await op.riskyMethod();
} catch (error) {
  const status = State.getStateStatus(op);

  console.log(status.state);  // "failed"
  console.log(status.transitions[0].exception);  // Error object
}
```

### Nested State Tracking

Only the outermost decorated method transitions states:

```typescript
class Processor {
  @State({
    start: "processing",
    end: "complete"
  })
  async process() {
    await this.step1();  // Doesn't trigger state change
    await this.step2();  // Doesn't trigger state change
  }

  @State({
    start: "step1",
    end: "step1-done"
  })
  private async step1() {
    // Inner state decorator (won't trigger on nested call)
  }

  @State({
    start: "step2",
    end: "step2-done"
  })
  private async step2() {
    // Inner state decorator (won't trigger on nested call)
  }
}

const processor = new Processor();
await processor.process();

const state = State.getCurrentState(processor);
console.log(state);  // "complete" (from outermost decorator)
```

### Common Use Cases

#### Job Processing

```typescript
class JobProcessor {
  @State({
    start: "queued",
    end: "processed",
    error: "failed"
  })
  async processJob(job: Job): Promise<void> {
    await this.validate(job);
    await this.execute(job);
    await this.cleanup(job);
  }

  getJobStatus(): string {
    return State.getCurrentState(this);
  }

  getJobHistory(): StateStatus {
    return State.getStateStatus(this);
  }
}

const processor = new JobProcessor();

// Process job
try {
  await processor.processJob(job);
  console.log(processor.getJobStatus());  // "processed"
} catch (error) {
  console.log(processor.getJobStatus());  // "failed"
}

// Get timing information
const history = processor.getJobHistory();
history.transitions.forEach(t => {
  console.log(`${t.step}: ${t.duration}ms`);
});
```

#### Workflow Management

```typescript
class Workflow {
  @State({ start: "initializing", end: "ready" })
  async initialize() {
    await this.loadConfig();
    await this.connectDatabase();
  }

  @State({ start: "running", end: "completed", error: "errored" })
  async run() {
    await this.processSteps();
  }

  @State({ start: "cleaning", end: "cleaned" })
  async cleanup() {
    await this.closeConnections();
  }

  async execute() {
    await this.initialize();
    await this.run();
    await this.cleanup();

    const status = State.getStateStatus(this);
    return {
      state: status.state,
      totalDuration: status.transitions.reduce((sum, t) => sum + t.duration, 0),
      steps: status.transitions.map(t => ({
        name: t.step,
        duration: t.duration
      }))
    };
  }
}
```

#### API Request Tracking

```typescript
class APIClient {
  private requestId = 0;

  @State({
    start: "requesting",
    end: "success",
    error: "error"
  })
  async request(url: string): Promise<Response> {
    const id = ++this.requestId;
    console.log(`[${id}] Requesting ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response;
  }

  getRequestStatus() {
    const status = State.getStateStatus(this);
    return {
      currentState: status.state,
      requestCount: status.transitions.length,
      avgDuration: status.transitions.reduce((sum, t) => sum + t.duration, 0) /
                   status.transitions.length
    };
  }
}

const client = new APIClient();
await client.request("https://api.example.com/data");

console.log(client.getRequestStatus());
```

## UUID Generation

Generate unique identifiers in multiple formats.

### Function Signature

```typescript
function getUuid(
  format?: "ascii" | "base64" | "hex" | "binary" | "uuid"
): string;
```

### UUID Format (Default)

Standard UUID format with hyphens:

```typescript
import { getUuid } from '@webda/utils';

const id = getUuid();
console.log(id);  // "550e8400-e29b-41d4-a716-446655440000"

// Explicit format
const uuid = getUuid("uuid");
console.log(uuid);  // "550e8400-e29b-41d4-a716-446655440000"
```

### Base64 Format

URL-safe base64 encoding (compact):

```typescript
const id = getUuid("base64");
console.log(id);  // "VQ6EAOKbQdSnFkRmVUQAAA"

// Shorter than UUID: 22 chars vs 36 chars
// URL-safe: uses - and _ instead of + and /
// No padding: trailing = removed
```

### Hex Format

Hexadecimal representation (no hyphens):

```typescript
const id = getUuid("hex");
console.log(id);  // "550e8400e29b41d4a716446655440000"

// 32 characters, lowercase
```

### Binary Format

Binary buffer representation:

```typescript
const id = getUuid("binary");
console.log(id);  // Binary buffer as string
```

### Common Use Cases

#### Database Primary Keys

```typescript
interface User {
  id: string;
  name: string;
  createdAt: Date;
}

function createUser(name: string): User {
  return {
    id: getUuid(),  // Standard UUID for database
    name,
    createdAt: new Date()
  };
}

const user = createUser("John Doe");
console.log(user.id);  // "550e8400-e29b-41d4-a716-446655440000"
```

#### URL Slugs

```typescript
function generateShortURL(longUrl: string): string {
  // Use base64 for shorter URLs
  const id = getUuid("base64");
  const slug = id.substring(0, 8);  // Use first 8 chars

  saveMapping(slug, longUrl);
  return `https://short.url/${slug}`;
}

const shortUrl = generateShortURL("https://example.com/very/long/url");
console.log(shortUrl);  // "https://short.url/VQ6EAOKb"
```

#### File Naming

```typescript
import { sanitizeFilename } from '@webda/utils';

function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  const id = getUuid("hex").substring(0, 12);

  return `${sanitizeFilename(base)}-${id}${ext}`;
}

const filename = generateUniqueFilename("my document.pdf");
console.log(filename);  // "my_document-550e8400e29b.pdf"
```

#### Session IDs

```typescript
class SessionManager {
  createSession(userId: string): string {
    const sessionId = getUuid("base64");

    sessions.set(sessionId, {
      userId,
      createdAt: Date.now()
    });

    return sessionId;
  }

  validateSession(sessionId: string): boolean {
    return sessions.has(sessionId);
  }
}

const manager = new SessionManager();
const session = manager.createSession("user-123");
console.log(session);  // "VQ6EAOKbQdSnFkRmVUQAAA"
```

#### Request Tracing

```typescript
class Logger {
  log(message: string) {
    const traceId = getUuid("hex");
    console.log(`[${traceId}] ${message}`);
  }
}

const logger = new Logger();
logger.log("Processing request");
// [550e8400e29b41d4a716446655440000] Processing request
```

## ESM Utilities

CommonJS-like utilities for ES modules.

### getCommonJS

Get `__filename` and `__dirname` in ES modules:

```typescript
import { getCommonJS } from '@webda/utils';

const { __filename, __dirname } = getCommonJS(import.meta.url);

console.log(__filename);  // /path/to/current/file.js
console.log(__dirname);   // /path/to/current

// Use like CommonJS
const configPath = path.join(__dirname, 'config.json');
const data = FileUtils.load(configPath);
```

### Common Use Cases

#### Loading Adjacent Files

```typescript
import { getCommonJS } from '@webda/utils';
import { FileUtils } from '@webda/utils';

const { __dirname } = getCommonJS(import.meta.url);

class MyService {
  private config: any;

  constructor() {
    const configPath = path.join(__dirname, '../config/service.yaml');
    this.config = FileUtils.load(configPath);
  }
}
```

#### Template Loading

```typescript
const { __dirname } = getCommonJS(import.meta.url);

function loadTemplate(name: string): string {
  const templatePath = path.join(__dirname, '../templates', `${name}.html`);
  return readFileSync(templatePath, 'utf-8');
}

const template = loadTemplate('email');
```

## Directory Management

### runWithCurrentDirectory

Execute code with a different working directory:

```typescript
import { runWithCurrentDirectory } from '@webda/utils';

// Current directory: /home/user/project
console.log(process.cwd());  // /home/user/project

await runWithCurrentDirectory('/tmp', async () => {
  console.log(process.cwd());  // /tmp
  await doSomethingInTmp();
});

console.log(process.cwd());  // /home/user/project (restored)
```

### Synchronous Usage

```typescript
const result = runWithCurrentDirectory('/tmp', () => {
  return performOperation();
});

console.log(result);  // Result from operation
```

### Error Handling

Directory is always restored, even on error:

```typescript
try {
  runWithCurrentDirectory('/tmp', () => {
    throw new Error("Something failed");
  });
} catch (error) {
  console.error(error);
}

// Working directory still restored to original
console.log(process.cwd());  // Original directory
```

### Common Use Cases

#### Build Scripts

```typescript
async function buildPackage(packageDir: string) {
  return runWithCurrentDirectory(packageDir, async () => {
    await exec('npm install');
    await exec('npm run build');
    await exec('npm test');
  });
}

await buildPackage('./packages/utils');
await buildPackage('./packages/core');
```

#### Testing

```typescript
describe('File operations', () => {
  it('should work in temp directory', async () => {
    await runWithCurrentDirectory('/tmp', async () => {
      FileUtils.save({ test: true }, 'test.json');
      const data = FileUtils.load('test.json');
      expect(data.test).toBe(true);
    });
  });
});
```

## Deep Freeze

Recursively freeze objects to prevent modification.

### Function Signature

```typescript
function deepFreeze<T>(object: T): T;
```

### Basic Usage

```typescript
import { deepFreeze } from '@webda/utils';

const config = deepFreeze({
  database: {
    host: "localhost",
    port: 5432
  },
  cache: {
    ttl: 3600
  }
});

// Modification attempts fail silently (or throw in strict mode)
config.database.host = "evil.com";  // No effect
console.log(config.database.host);   // "localhost"

config.cache = {};  // No effect
console.log(config.cache.ttl);  // 3600
```

### Common Use Cases

#### Immutable Configuration

```typescript
class Application {
  private readonly config: any;

  constructor(configData: any) {
    this.config = deepFreeze(configData);
  }

  getConfig(): any {
    // Safe to return - cannot be modified
    return this.config;
  }
}

const app = new Application({
  api: { timeout: 5000 }
});

const config = app.getConfig();
config.api.timeout = 1000;  // No effect
```

#### Constants

```typescript
export const CONSTANTS = deepFreeze({
  HTTP_STATUS: {
    OK: 200,
    NOT_FOUND: 404,
    ERROR: 500
  },
  TIMEOUTS: {
    SHORT: 1000,
    MEDIUM: 5000,
    LONG: 30000
  }
});

// Cannot be modified
CONSTANTS.HTTP_STATUS.OK = 201;  // No effect
```

## Best Practices

### 1. Use RegExpStringValidator for Flexible Configuration

```typescript
// Good: Flexible validation
const validator = new RegExpStringValidator([
  "localhost",
  "127.0.0.1",
  "regex:^.*\\.example\\.com$"
]);

// Bad: Only exact matches
const hosts = ["localhost", "api.example.com", "cdn.example.com"];
const isAllowed = hosts.includes(hostname);  // Doesn't scale
```

### 2. Track State for Long-Running Operations

```typescript
// Good: Track state transitions
class Migration {
  @State({ start: "migrating", end: "complete", error: "failed" })
  async migrate() {
    // Long operation with state tracking
  }
}

// Bad: No visibility into progress
class Migration {
  async migrate() {
    // No way to track progress
  }
}
```

### 3. Use Appropriate UUID Format

```typescript
// Good: Short URLs with base64
const shortId = getUuid("base64");  // 22 chars

// Good: Database keys with standard UUID
const id = getUuid();  // Standard format

// Bad: Standard UUID in URLs
const url = `https://example.com/${getUuid()}`;  // 36 chars
```

### 4. Freeze Configuration Objects

```typescript
// Good: Immutable config
const config = deepFreeze(loadConfig());

// Bad: Mutable config can be accidentally changed
const config = loadConfig();
someFunction(config);  // Might modify config
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation
