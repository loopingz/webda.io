---
sidebar_position: 2
title: Getting Started
description: Quick start guide for @webda/utils
---

# Getting Started

This guide will help you get started with `@webda/utils` and learn the most commonly used utilities.

## Installation

Install the package using your preferred package manager:

```bash
npm install @webda/utils
```

```bash
yarn add @webda/utils
```

```bash
pnpm add @webda/utils
```

## Requirements

- **Node.js:** >=22.0.0
- **Module System:** ES Modules (ESM)

## Basic Imports

All utilities can be imported from the main package:

```typescript
import {
  TransformCase,
  Duration,
  FileSize,
  Throttler,
  FileUtils,
  getUuid
} from '@webda/utils';
```

Or import specific modules:

```typescript
import { TransformCase } from '@webda/utils/lib/case.js';
import { Duration } from '@webda/utils/lib/duration.js';
```

## Common Use Cases

### 1. Transform Naming Conventions

Convert strings between different naming conventions:

```typescript
import { TransformCase } from '@webda/utils';

// API endpoint naming
const endpoint = TransformCase("UserProfile", "kebab-case");
console.log(endpoint);  // "user-profile"

// Database field naming
const dbField = TransformCase("firstName", "snake_case");
console.log(dbField);  // "first_name"

// Environment variable naming
const envVar = TransformCase("apiKey", "ENV_VAR");
console.log(envVar);  // "API_KEY"

// Class naming
const className = TransformCase("user-service", "PascalCase");
console.log(className);  // "UserService"
```

**Supported Cases:**
- `"none"` - No transformation
- `"camelCase"` - camelCase
- `"PascalCase"` - PascalCase
- `"snake_case"` - snake_case
- `"kebab-case"` - kebab-case
- `"ENV_VAR"` - SCREAMING_SNAKE_CASE
- `"UPPERCASE"` - UPPERCASE
- `"lowercase"` - lowercase

### 2. Parse Durations

Work with human-friendly duration strings:

```typescript
import { Duration } from '@webda/utils';

// Simple durations
const seconds = new Duration("30s");
const minutes = new Duration("5m");
const hours = new Duration("2h");
const days = new Duration("1d");

// Composite durations
const complex = new Duration("1d2h30m15s");
console.log(complex.toSeconds());  // 95415
console.log(complex.toMs());       // 95415000

// Numeric defaults to seconds
const timeout = new Duration(60);  // 60 seconds

// Check expiration
const start = Date.now();
await doSomething();
if (timeout.expired(start)) {
  console.log("Operation timed out");
}
```

**Supported Units:**
- `s`, `sec`, `second`, `seconds` - Seconds
- `m`, `min`, `minute`, `minutes` - Minutes
- `h`, `hr`, `hour`, `hours` - Hours
- `d`, `day`, `days` - Days (24 hours)
- `mo`, `month`, `months` - Months (30 days)
- `y`, `yr`, `year`, `years` - Years (365 days)

### 3. Parse File Sizes

Handle file sizes with automatic unit conversion:

```typescript
import { FileSize } from '@webda/utils';

// Parse from strings
const size1 = new FileSize("1 MB");
const size2 = new FileSize("1.5GB");
const size3 = new FileSize("500KB");

// Parse from numbers (bytes)
const size4 = new FileSize(1048576);  // 1 MB in bytes

// Get values
console.log(size1.valueOf());   // 1048576 (bytes)
console.log(size1.toString());  // "1.00 MB"

// Compare sizes
if (fileSize > new FileSize("10 MB").valueOf()) {
  console.log("File is too large");
}

// Use in calculations
const maxSize = new FileSize("100 MB");
const usedSpace = new FileSize(totalBytes);
const remaining = maxSize.valueOf() - usedSpace.valueOf();
```

**Supported Units:**
- `B` / `O` - Bytes
- `KB` / `KO` - Kilobytes (1024 bytes)
- `MB` / `MO` - Megabytes
- `GB` / `GO` - Gigabytes
- `TB` / `TO` - Terabytes
- `PB` / `PO` - Petabytes

### 4. Throttle Concurrent Operations

Control how many promises run simultaneously:

```typescript
import { Throttler } from '@webda/utils';

// Create throttler with max 5 concurrent operations
const throttler = new Throttler(5);

// Queue multiple operations
const urls = [...]; // Array of URLs

for (const url of urls) {
  throttler.queue(async () => {
    const response = await fetch(url);
    const data = await response.json();
    return processData(data);
  });
}

// Wait for all to complete
await throttler.wait();
console.log("All operations complete");
```

**Advanced Usage:**

```typescript
// With error handling
const throttler = new Throttler(10);

for (let i = 0; i < 100; i++) {
  throttler.queue(async () => {
    try {
      await processItem(i);
    } catch (error) {
      console.error(`Failed to process item ${i}:`, error);
    }
  });
}

await throttler.wait();

// Dynamic concurrency adjustment
throttler.setConcurrency(20);  // Increase to 20 concurrent

// Check in-progress operations
const running = throttler.getInProgress();
console.log(`Currently running: ${running.length} operations`);
```

### 5. Retry Logic with Backoff

Implement retry mechanisms for unreliable operations:

```typescript
import { WaitFor, WaitExponentialDelay } from '@webda/utils';

// Simple retry with exponential backoff
await WaitFor(
  async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Request failed");
    }
    return true;
  },
  5,  // Max 5 retries
  "Fetching data"
);

// Custom exponential backoff
await WaitFor(
  async () => {
    // Your operation
    return await checkCondition();
  },
  10,
  "Waiting for condition",
  new WaitExponentialDelay(
    100,   // Initial delay: 100ms
    2,     // Multiplier: 2x each retry
    5000   // Max delay: 5s
  )
);

// Linear delay (constant wait between retries)
import { WaitLinearDelay } from '@webda/utils';

await WaitFor(
  async () => checkStatus(),
  20,
  "Checking status",
  new WaitLinearDelay(1000)  // Wait 1s between each retry
);
```

**Simple Sleep:**

```typescript
import { sleep } from '@webda/utils';

console.log("Starting");
await sleep(2000);  // Wait 2 seconds
console.log("After 2 seconds");
```

### 6. Load and Save Files

Work with configuration files in multiple formats:

```typescript
import { FileUtils } from '@webda/utils';

// Load files (automatic format detection)
const config = FileUtils.load("config.yaml");
const data = FileUtils.load("data.json");
const settings = FileUtils.load("settings.jsonc");  // JSON with comments

// Save files (format based on extension)
FileUtils.save({ name: "test", value: 123 }, "output.json");
FileUtils.save({ name: "test", value: 123 }, "output.yaml");

// Compressed files
FileUtils.save(largeData, "data.json.gz");  // Automatic gzip compression
const compressed = FileUtils.load("data.json.gz");  // Automatic decompression

// Load configuration files (tries .json, .yaml, .jsonc)
const config = FileUtils.loadConfigurationFile("config");
// Looks for: config.json, config.yaml, config.yml, config.jsonc
```

**Walk Directories:**

```typescript
// Walk all files
FileUtils.walk("./src", (filepath) => {
  console.log(filepath);
});

// Find specific files
const tsFiles = FileUtils.find("./src", {
  filterPattern: /\.ts$/
});

console.log(`Found ${tsFiles.length} TypeScript files`);

// With custom filter
const files = FileUtils.find("./src", {
  filterPattern: /\.ts$/,
  filter: (filepath) => !filepath.includes("test")
});
```

### 7. Generate UUIDs

Create unique identifiers in various formats:

```typescript
import { getUuid } from '@webda/utils';

// Standard UUID format
const id1 = getUuid();
// "550e8400-e29b-41d4-a716-446655440000"

// Base64 format (URL-safe, compact)
const id2 = getUuid("base64");
// "VQ6EAOKbQdSnFkRmVUQAAA"

// Hexadecimal format
const id3 = getUuid("hex");
// "550e8400e29b41d4a716446655440000"

// Use in your application
const user = {
  id: getUuid(),
  name: "John Doe",
  createdAt: new Date()
};
```

### 8. Validate Strings

Validate input against patterns:

```typescript
import { RegExpValidator, RegExpStringValidator } from '@webda/utils';

// Simple regex validation
const emailValidator = new RegExpValidator("^[\\w.]+@\\w+\\.\\w+$");
console.log(emailValidator.validate("user@example.com"));  // true
console.log(emailValidator.validate("invalid"));            // false

// Combined validation (exact matches + regex)
const validator = new RegExpStringValidator([
  "admin",              // Exact match
  "superuser",          // Exact match
  "regex:^user-\\d+$"   // Regex pattern (must start with "regex:")
]);

console.log(validator.validate("admin"));      // true (exact match)
console.log(validator.validate("superuser")); // true (exact match)
console.log(validator.validate("user-123"));  // true (matches regex)
console.log(validator.validate("invalid"));   // false
```

### 9. Track State with Decorators

Monitor method execution states:

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

  @State({
    start: "transforming",
    end: "transformed"
  })
  private async transform(data: any): Promise<void> {
    // Transformation logic
  }

  private async validate(data: any): Promise<void> {
    // Validation logic
  }
}

// Usage
const processor = new DataProcessor();
await processor.processData({ name: "test" });

// Check current state
const currentState = State.getCurrentState(processor);
console.log(currentState);  // "complete"

// Get detailed status with transitions
const status = State.getStateStatus(processor);
console.log(status.state);  // "complete"
console.log(status.transitions);  // Array of state transitions
// [
//   { state: "processing", date: 1234567890, error: undefined },
//   { state: "complete", date: 1234567900, error: undefined }
// ]

// Check for errors
if (status.transitions.some(t => t.error)) {
  console.error("Processing had errors");
}
```

### 10. ESM Utilities

Get CommonJS-like globals in ES modules:

```typescript
import { getCommonJS } from '@webda/utils';

const { __filename, __dirname } = getCommonJS(import.meta.url);

console.log(__filename);  // Current file path
console.log(__dirname);   // Current directory path

// Use like CommonJS
const configPath = path.join(__dirname, 'config.json');
```

## Complete Example

Here's a practical example combining multiple utilities:

```typescript
import {
  FileUtils,
  Throttler,
  WaitFor,
  WaitExponentialDelay,
  Duration,
  FileSize,
  TransformCase,
  getUuid
} from '@webda/utils';

interface ProcessingConfig {
  maxConcurrency: number;
  timeout: string;
  maxFileSize: string;
  retries: number;
}

class BatchProcessor {
  private config: ProcessingConfig;
  private timeout: Duration;
  private maxSize: FileSize;

  constructor(configPath: string) {
    // Load configuration
    this.config = FileUtils.load(configPath);
    this.timeout = new Duration(this.config.timeout);
    this.maxSize = new FileSize(this.config.maxFileSize);
  }

  async processDirectory(inputDir: string, outputDir: string): Promise<void> {
    const startTime = Date.now();

    // Find all JSON files
    const files = FileUtils.find(inputDir, {
      filterPattern: /\.json$/
    });

    console.log(`Found ${files.length} files to process`);

    // Create throttler for concurrent processing
    const throttler = new Throttler(this.config.maxConcurrency);
    const results: Array<{ file: string; id: string; status: string }> = [];

    // Process each file
    for (const file of files) {
      throttler.queue(async () => {
        // Check timeout
        if (this.timeout.expired(startTime)) {
          throw new Error("Processing timeout exceeded");
        }

        // Check file size
        const stats = await fs.stat(file);
        if (stats.size > this.maxSize.valueOf()) {
          console.warn(`Skipping ${file}: exceeds max size`);
          return;
        }

        // Process with retry logic
        const result = await WaitFor(
          async () => {
            const data = FileUtils.load(file);
            const processed = this.transform(data);

            // Generate output filename
            const id = getUuid("base64");
            const name = TransformCase(data.name || id, "kebab-case");
            const outputPath = `${outputDir}/${name}.json`;

            FileUtils.save(processed, outputPath);

            return { file, id, status: "success" };
          },
          this.config.retries,
          `Processing ${file}`,
          new WaitExponentialDelay(100, 2, 2000)
        );

        results.push(result);
      });
    }

    // Wait for all to complete
    await throttler.wait();

    // Save summary
    FileUtils.save({
      processed: results.length,
      duration: Date.now() - startTime,
      files: results
    }, `${outputDir}/summary.json`);

    console.log(`Processed ${results.length} files successfully`);
  }

  private transform(data: any): any {
    // Your transformation logic
    return {
      ...data,
      processedAt: new Date().toISOString(),
      version: 2
    };
  }
}

// Usage
const processor = new BatchProcessor("config.yaml");
await processor.processDirectory("./input", "./output");
```

**config.yaml:**
```yaml
maxConcurrency: 10
timeout: "5m"
maxFileSize: "10 MB"
retries: 3
```

## Common Patterns

### Pattern 1: Configuration Loading

```typescript
import { FileUtils } from '@webda/utils';

class Application {
  private config: any;

  constructor() {
    // Try multiple config files
    this.config =
      FileUtils.loadConfigurationFile("config") ||
      FileUtils.loadConfigurationFile("default-config") ||
      this.getDefaultConfig();
  }

  private getDefaultConfig() {
    return {
      port: 3000,
      host: "localhost"
    };
  }
}
```

### Pattern 2: Rate-Limited API Calls

```typescript
import { Throttler, sleep } from '@webda/utils';

class ApiClient {
  private throttler = new Throttler(5);  // 5 concurrent max

  async fetchMany(urls: string[]): Promise<any[]> {
    const results: any[] = [];

    for (const url of urls) {
      this.throttler.queue(async () => {
        const data = await this.fetch(url);
        results.push(data);
        await sleep(100);  // Rate limiting: 100ms between requests
      });
    }

    await this.throttler.wait();
    return results;
  }

  private async fetch(url: string): Promise<any> {
    const response = await fetch(url);
    return response.json();
  }
}
```

### Pattern 3: Resilient Operations

```typescript
import { WaitFor, WaitExponentialDelay } from '@webda/utils';

async function resilientOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  return WaitFor(
    operation,
    maxRetries,
    "Resilient operation",
    new WaitExponentialDelay(1000, 2, 10000)
  );
}

// Usage
const data = await resilientOperation(
  async () => await fetchFromUnreliableAPI()
);
```

## Next Steps

Now that you understand the basics, explore more advanced topics:

- [Data Transformation](./data-transformation.md) - Detailed guide on case conversion, durations, and file sizes
- [Async Utilities](./async-utilities.md) - Advanced throttling and retry patterns
- [File Operations](./file-operations.md) - Comprehensive file handling guide
- [Validation & State](./validation-state.md) - Input validation and state management
- [API Reference](./api-reference.md) - Complete API documentation
