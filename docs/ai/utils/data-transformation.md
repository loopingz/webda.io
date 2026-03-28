---
sidebar_position: 3
title: Data Transformation
description: Case conversion, duration parsing, and file size utilities
---

# Data Transformation

This guide covers utilities for transforming and parsing data: case conversion, duration parsing, and file size handling.

## Case Transformation

The `TransformCase` function converts strings between different naming conventions, which is essential for working across different systems and APIs.

### Function Signature

```typescript
function TransformCase(
  name: string,
  newCase: TransformCaseType
): string

type TransformCaseType =
  | "none"
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "kebab-case"
  | "ENV_VAR"
  | "UPPERCASE"
  | "lowercase"
```

### Supported Cases

#### camelCase
First word lowercase, subsequent words capitalized, no separators.

```typescript
import { TransformCase } from '@webda/utils';

TransformCase("user_profile", "camelCase");     // "userProfile"
TransformCase("USER-NAME", "camelCase");        // "userName"
TransformCase("FirstName", "camelCase");        // "firstName"
TransformCase("my-api-key", "camelCase");       // "myApiKey"
```

#### PascalCase
All words capitalized, no separators (also called UpperCamelCase).

```typescript
TransformCase("user_service", "PascalCase");    // "UserService"
TransformCase("api-client", "PascalCase");      // "ApiClient"
TransformCase("firstName", "PascalCase");       // "FirstName"
TransformCase("my_class_name", "PascalCase");   // "MyClassName"
```

#### snake_case
All lowercase, words separated by underscores.

```typescript
TransformCase("UserProfile", "snake_case");     // "user_profile"
TransformCase("myAPIKey", "snake_case");        // "my_api_key"
TransformCase("firstName", "snake_case");       // "first_name"
TransformCase("HTTPResponse", "snake_case");    // "http_response"
```

#### kebab-case
All lowercase, words separated by hyphens (also called dash-case or lisp-case).

```typescript
TransformCase("UserProfile", "kebab-case");     // "user-profile"
TransformCase("myAPIKey", "kebab-case");        // "my-api-key"
TransformCase("first_name", "kebab-case");      // "first-name"
TransformCase("HTTPResponse", "kebab-case");    // "http-response"
```

#### ENV_VAR (SCREAMING_SNAKE_CASE)
All uppercase, words separated by underscores.

```typescript
TransformCase("apiKey", "ENV_VAR");             // "API_KEY"
TransformCase("databaseUrl", "ENV_VAR");        // "DATABASE_URL"
TransformCase("my-setting", "ENV_VAR");         // "MY_SETTING"
```

#### UPPERCASE / lowercase
Simple case conversion.

```typescript
TransformCase("Hello World", "UPPERCASE");      // "HELLO WORLD"
TransformCase("Hello World", "lowercase");      // "hello world"
```

#### none
No transformation (returns input as-is).

```typescript
TransformCase("Whatever_Format", "none");       // "Whatever_Format"
```

### Common Use Cases

#### API Routes and Endpoints

```typescript
class APIController {
  generateRoute(modelName: string): string {
    // Convert model name to kebab-case for REST endpoints
    return `/api/${TransformCase(modelName, "kebab-case")}`;
  }
}

console.log(generateRoute("UserProfile"));      // "/api/user-profile"
console.log(generateRoute("OrderItem"));        // "/api/order-item"
```

#### Database Migrations

```typescript
function generateColumnName(propertyName: string): string {
  // Convert TypeScript property names to database column names
  return TransformCase(propertyName, "snake_case");
}

class User {
  firstName: string;  // → first_name in database
  lastName: string;   // → last_name in database
  emailAddress: string;  // → email_address in database
}
```

#### Environment Variables

```typescript
interface Config {
  apiKey: string;
  databaseUrl: string;
  maxConnections: number;
}

function loadFromEnv(config: Config): void {
  for (const key of Object.keys(config)) {
    const envKey = TransformCase(key, "ENV_VAR");
    const value = process.env[envKey];
    if (value) {
      config[key] = value;
    }
  }
}

// Reads: API_KEY, DATABASE_URL, MAX_CONNECTIONS
```

#### Code Generation

```typescript
function generateClass(tableName: string): string {
  const className = TransformCase(tableName, "PascalCase");
  const properties = getTableColumns(tableName).map(col => {
    const propName = TransformCase(col.name, "camelCase");
    return `  ${propName}: ${col.type};`;
  }).join('\n');

  return `
class ${className} {
${properties}
}
  `.trim();
}

// users table → User class with camelCase properties
```

## Duration Parsing

The `Duration` class parses human-friendly duration strings and provides convenient conversion methods.

### Class Definition

```typescript
class Duration {
  constructor(duration: string | number);

  toSeconds(): number;
  toMs(): number;
  expired(start: number): boolean;
  valueOf(): number;  // Returns milliseconds
}
```

### Supported Units

| Unit | Aliases | Example |
|------|---------|---------|
| Seconds | `s`, `sec`, `second`, `seconds` | `"30s"`, `"45sec"` |
| Minutes | `m`, `min`, `minute`, `minutes` | `"5m"`, `"10min"` |
| Hours | `h`, `hr`, `hour`, `hours` | `"2h"`, `"1hr"` |
| Days | `d`, `day`, `days` | `"3d"`, `"1day"` |
| Months | `mo`, `month`, `months` | `"2mo"` (30 days) |
| Years | `y`, `yr`, `year`, `years` | `"1y"` (365 days) |

### Basic Usage

```typescript
import { Duration } from '@webda/utils';

// Simple durations
const sec = new Duration("30s");
const min = new Duration("5m");
const hr = new Duration("2h");
const day = new Duration("1d");

// Get values
console.log(sec.toSeconds());  // 30
console.log(min.toSeconds());  // 300
console.log(hr.toSeconds());   // 7200
console.log(day.toSeconds());  // 86400

// Get milliseconds
console.log(sec.toMs());       // 30000
console.log(min.toMs());       // 300000
```

### Composite Durations

Combine multiple units in a single string:

```typescript
// Complex durations
const d1 = new Duration("1d2h");           // 1 day + 2 hours
const d2 = new Duration("2h30m");          // 2 hours + 30 minutes
const d3 = new Duration("1d2h30m15s");     // All units combined

console.log(d1.toSeconds());  // 93600 (86400 + 7200)
console.log(d2.toSeconds());  // 9000 (7200 + 1800)
console.log(d3.toSeconds());  // 95415
```

### Numeric Input

Numbers are interpreted as seconds:

```typescript
const d1 = new Duration(60);      // 60 seconds
const d2 = new Duration(3600);    // 1 hour
const d3 = new Duration(86400);   // 1 day

console.log(d1.toSeconds());  // 60
console.log(d2.toSeconds());  // 3600
```

### Expiration Checking

Check if a duration has elapsed since a start time:

```typescript
const timeout = new Duration("30s");
const start = Date.now();

// Do some work
await doSomething();

if (timeout.expired(start)) {
  throw new Error("Operation timed out");
}
```

### Common Use Cases

#### Request Timeouts

```typescript
class HTTPClient {
  private timeout: Duration;

  constructor(timeoutStr: string = "30s") {
    this.timeout = new Duration(timeoutStr);
  }

  async fetch(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.timeout.toMs()
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const client = new HTTPClient("5s");
```

#### Cache Expiration

```typescript
class Cache<T> {
  private data = new Map<string, { value: T; timestamp: number }>();
  private ttl: Duration;

  constructor(ttl: string = "5m") {
    this.ttl = new Duration(ttl);
  }

  set(key: string, value: T): void {
    this.data.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): T | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;

    if (this.ttl.expired(entry.timestamp)) {
      this.data.delete(key);
      return undefined;
    }

    return entry.value;
  }
}

const cache = new Cache<string>("10m");
```

#### Rate Limiting

```typescript
class RateLimiter {
  private window: Duration;
  private requests: number[] = [];

  constructor(window: string, maxRequests: number) {
    this.window = new Duration(window);
    this.maxRequests = maxRequests;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.window.toMs();

    // Remove old requests
    this.requests = this.requests.filter(t => t > windowStart);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.window.toMs() - now;
      await sleep(waitTime);
      return this.acquire();
    }

    this.requests.push(now);
  }
}

const limiter = new RateLimiter("1m", 10);  // 10 requests per minute
```

#### Session Management

```typescript
interface Session {
  id: string;
  userId: string;
  createdAt: number;
}

class SessionManager {
  private sessions = new Map<string, Session>();
  private maxAge: Duration;

  constructor(maxAge: string = "24h") {
    this.maxAge = new Duration(maxAge);
  }

  createSession(userId: string): Session {
    const session = {
      id: getUuid(),
      userId,
      createdAt: Date.now()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  isValid(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (this.maxAge.expired(session.createdAt)) {
      this.sessions.delete(sessionId);
      return false;
    }

    return true;
  }
}

const manager = new SessionManager("24h");
```

## File Size Handling

The `FileSize` class parses and formats file sizes with automatic unit conversion.

### Class Definition

```typescript
class FileSize {
  constructor(size: string | number);

  valueOf(): number;  // Returns bytes
  toString(): string;  // Returns formatted string
  [Symbol.toPrimitive](hint: string): number | string;
}
```

### Supported Units

| Unit | Aliases | Bytes |
|------|---------|-------|
| Bytes | `B`, `O` | 1 |
| Kilobytes | `KB`, `KO` | 1,024 |
| Megabytes | `MB`, `MO` | 1,048,576 |
| Gigabytes | `GB`, `GO` | 1,073,741,824 |
| Terabytes | `TB`, `TO` | 1,099,511,627,776 |
| Petabytes | `PB`, `PO` | 1,125,899,906,842,624 |

### Basic Usage

```typescript
import { FileSize } from '@webda/utils';

// Parse from strings
const size1 = new FileSize("1 KB");
const size2 = new FileSize("1.5MB");
const size3 = new FileSize("2.5 GB");

// Parse from numbers (bytes)
const size4 = new FileSize(1048576);  // 1 MB

// Get byte value
console.log(size1.valueOf());  // 1024
console.log(size2.valueOf());  // 1572864
console.log(size3.valueOf());  // 2684354560

// Format for display
console.log(size1.toString());  // "1.00 KB"
console.log(size2.toString());  // "1.50 MB"
console.log(size3.toString());  // "2.50 GB"
```

### Flexible Parsing

```typescript
// With or without spaces
new FileSize("10MB");    // ✓
new FileSize("10 MB");   // ✓

// Case insensitive
new FileSize("10mb");    // ✓
new FileSize("10MB");    // ✓

// Decimal values
new FileSize("1.5GB");   // ✓
new FileSize("0.5MB");   // ✓

// French notation
new FileSize("10 MO");   // ✓ (same as 10 MB)
```

### Common Use Cases

#### File Upload Limits

```typescript
class FileUploader {
  private maxSize: FileSize;

  constructor(maxSizeStr: string = "10 MB") {
    this.maxSize = new FileSize(maxSizeStr);
  }

  async upload(file: File): Promise<void> {
    if (file.size > this.maxSize.valueOf()) {
      throw new Error(
        `File too large. Maximum size: ${this.maxSize.toString()}`
      );
    }

    // Upload file
    await this.uploadFile(file);
  }
}

const uploader = new FileUploader("5 MB");
```

#### Storage Quota Management

```typescript
class StorageManager {
  private quota: FileSize;
  private used: number = 0;

  constructor(quotaStr: string) {
    this.quota = new FileSize(quotaStr);
  }

  addFile(size: number): boolean {
    if (this.used + size > this.quota.valueOf()) {
      return false;  // Would exceed quota
    }

    this.used += size;
    return true;
  }

  getRemainingSpace(): string {
    const remaining = this.quota.valueOf() - this.used;
    return new FileSize(remaining).toString();
  }

  getUsagePercentage(): number {
    return (this.used / this.quota.valueOf()) * 100;
  }
}

const storage = new StorageManager("100 GB");
console.log(storage.getRemainingSpace());  // "100.00 GB"
storage.addFile(10 * 1024 * 1024);  // Add 10 MB
console.log(storage.getUsagePercentage());  // 0.01%
```

#### Log Rotation

```typescript
class LogRotator {
  private maxSize: FileSize;
  private currentSize: number = 0;

  constructor(maxSizeStr: string = "50 MB") {
    this.maxSize = new FileSize(maxSizeStr);
  }

  shouldRotate(newDataSize: number): boolean {
    return this.currentSize + newDataSize > this.maxSize.valueOf();
  }

  write(data: string): void {
    const dataSize = Buffer.byteLength(data, 'utf8');

    if (this.shouldRotate(dataSize)) {
      this.rotate();
      this.currentSize = 0;
    }

    fs.appendFileSync('app.log', data);
    this.currentSize += dataSize;
  }

  private rotate(): void {
    const timestamp = Date.now();
    fs.renameSync('app.log', `app.log.${timestamp}`);
  }
}

const rotator = new LogRotator("10 MB");
```

#### Disk Space Monitoring

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkDiskSpace(path: string, threshold: string): Promise<void> {
  const { stdout } = await execAsync(`df -k ${path}`);
  const lines = stdout.trim().split('\n');
  const data = lines[1].split(/\s+/);
  const available = parseInt(data[3]) * 1024;  // Convert to bytes

  const thresholdSize = new FileSize(threshold);

  if (available < thresholdSize.valueOf()) {
    console.warn(
      `Low disk space: ${new FileSize(available).toString()} ` +
      `(threshold: ${thresholdSize.toString()})`
    );
  }
}

await checkDiskSpace('/var/log', '1 GB');
```

## Combining Utilities

These utilities work well together:

```typescript
import { TransformCase, Duration, FileSize } from '@webda/utils';

interface ProcessingConfig {
  modelName: string;
  timeout: string;
  maxFileSize: string;
}

class DataProcessor {
  private config: ProcessingConfig;
  private timeout: Duration;
  private maxSize: FileSize;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.timeout = new Duration(config.timeout);
    this.maxSize = new FileSize(config.maxFileSize);
  }

  getOutputPath(): string {
    // Transform model name for file path
    const filename = TransformCase(this.config.modelName, "kebab-case");
    return `./output/${filename}.json`;
  }

  async processFile(filepath: string): Promise<void> {
    const start = Date.now();

    // Check file size
    const stats = await fs.stat(filepath);
    if (stats.size > this.maxSize.valueOf()) {
      throw new Error(
        `File too large: ${new FileSize(stats.size).toString()} ` +
        `(max: ${this.maxSize.toString()})`
      );
    }

    // Process with timeout
    const data = await this.loadData(filepath);

    if (this.timeout.expired(start)) {
      throw new Error("Processing timeout");
    }

    await this.saveData(data, this.getOutputPath());
  }
}

const processor = new DataProcessor({
  modelName: "UserProfile",
  timeout: "30s",
  maxFileSize: "10 MB"
});
```

## Next Steps

- [Async Utilities](./async-utilities.md) - Throttling and retry patterns
- [File Operations](./file-operations.md) - File I/O and serialization
- [API Reference](./api-reference.md) - Complete API documentation
