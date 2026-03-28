---
sidebar_position: 1
title: Overview
description: Introduction to @webda/utils - Comprehensive utility functions for Node.js
---

# @webda/utils

A comprehensive collection of utility functions and classes for Node.js projects, providing solutions for common development tasks.

## What is @webda/utils?

`@webda/utils` is a carefully curated set of utilities that solve real-world problems in Node.js development:

- **Data Transformation** - Convert between naming conventions, parse durations and file sizes
- **Async Operations** - Throttle promises, implement retry logic with exponential backoff
- **File Operations** - Load/save YAML/JSON with comments preserved, walk directories, handle compression
- **Validation** - Flexible regex-based validation with multiple patterns
- **State Management** - Track method execution states with decorators
- **Stream Processing** - Handle NDJSON, conditional decompression, buffer streams
- **ESM Support** - CommonJS-like utilities for ES modules

## Key Features

### 🔄 Flexible Data Transformation
Convert strings between different naming conventions (camelCase, snake_case, PascalCase, kebab-case, etc.).

```typescript
import { TransformCase } from '@webda/utils';

TransformCase("UsersController", "snake_case");  // "users_controller"
TransformCase("user_name", "camelCase");         // "userName"
TransformCase("my-app", "PascalCase");           // "MyApp"
```

### ⏱️ Human-Friendly Duration and Size Parsing
Parse flexible duration strings and file sizes with automatic unit conversion.

```typescript
import { Duration, FileSize } from '@webda/utils';

const duration = new Duration("1d2h30m");
console.log(duration.toSeconds());  // 95400

const size = new FileSize("1.5 GB");
console.log(size.valueOf());        // 1610612736 bytes
console.log(size.toString());       // "1.50 GB"
```

### 🚀 Promise Throttling
Control concurrent promise execution with intelligent queue management.

```typescript
import { Throttler } from '@webda/utils';

const throttler = new Throttler(10);  // Max 10 concurrent

for (let i = 0; i < 100; i++) {
  throttler.queue(async () => {
    await processItem(i);
  });
}

await throttler.wait();  // Wait for all to complete
```

### 🔁 Retry Logic with Backoff
Implement sophisticated retry mechanisms with configurable delay strategies.

```typescript
import { WaitFor, WaitExponentialDelay } from '@webda/utils';

await WaitFor(
  async () => {
    const result = await checkCondition();
    return result;
  },
  10,  // Max retries
  "Waiting for condition",
  new WaitExponentialDelay(100, 2, 5000)  // 100ms base, 2x multiplier, 5s max
);
```

### 📁 Smart File Operations
Load and save configuration files with format detection, comment preservation, and compression support.

```typescript
import { FileUtils } from '@webda/utils';

// Automatic format detection
const config = FileUtils.load("config.yaml");

// Preserve comments in YAML
FileUtils.save(data, "config.yaml");

// Compressed files
FileUtils.save(largeData, "data.json.gz");

// Walk directories
FileUtils.walk("./src", (filepath) => {
  console.log(filepath);
});
```

### ✅ Flexible Validation
Validate strings against multiple patterns with regex and exact match support.

```typescript
import { RegExpStringValidator } from '@webda/utils';

const validator = new RegExpStringValidator([
  "exact-match",
  "another-match",
  "regex:^[a-z0-9-]+$"
]);

validator.validate("exact-match");  // true
validator.validate("test-123");     // true (matches regex)
validator.validate("Invalid!");     // false
```

### 📊 State Management
Track method execution states with decorators for monitoring and debugging.

```typescript
import { State } from '@webda/utils';

class DataProcessor {
  @State({ start: "processing", end: "complete", error: "failed" })
  async process() {
    // Your processing logic
  }
}

const processor = new DataProcessor();
await processor.process();

const status = State.getStateStatus(processor);
console.log(status.state);        // "complete"
console.log(status.transitions);  // Array of state transitions
```

## Installation

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

## Quick Start

```typescript
import {
  TransformCase,
  Duration,
  FileSize,
  Throttler,
  FileUtils,
  getUuid
} from '@webda/utils';

// Transform naming conventions
const apiName = TransformCase("UserController", "kebab-case");  // "user-controller"

// Parse durations
const timeout = new Duration("30s");
if (timeout.expired(startTime)) {
  console.log("Timeout!");
}

// Parse file sizes
const maxSize = new FileSize("10 MB");
if (fileSize > maxSize.valueOf()) {
  console.log("File too large");
}

// Throttle concurrent operations
const throttler = new Throttler(5);
for (const item of items) {
  throttler.queue(async () => await process(item));
}
await throttler.wait();

// Load configuration
const config = FileUtils.load("config.yaml");

// Generate UUID
const id = getUuid();  // "550e8400-e29b-41d4-a716-446655440000"
```

## Complete Example

Here's a complete example combining multiple utilities:

```typescript
import {
  FileUtils,
  Throttler,
  WaitFor,
  WaitExponentialDelay,
  Duration,
  State,
  TransformCase
} from '@webda/utils';

class DataProcessor {
  private config: any;
  private timeout: Duration;

  constructor(configPath: string) {
    // Load configuration with automatic format detection
    this.config = FileUtils.load(configPath);
    this.timeout = new Duration(this.config.timeout || "5m");
  }

  @State({ start: "processing", end: "complete", error: "failed" })
  async processFiles(directory: string): Promise<void> {
    const startTime = Date.now();

    // Find all JSON files
    const files = FileUtils.find(directory, {
      filterPattern: /\.json$/
    });

    console.log(`Found ${files.length} files to process`);

    // Process with throttling (max 10 concurrent)
    const throttler = new Throttler(10);

    for (const file of files) {
      throttler.queue(async () => {
        // Check timeout
        if (this.timeout.expired(startTime)) {
          throw new Error("Processing timeout");
        }

        // Process with retry logic
        await WaitFor(
          async () => {
            const data = FileUtils.load(file);
            const processed = await this.transform(data);

            // Save with transformed name
            const newName = TransformCase(
              data.name,
              this.config.namingConvention
            );
            FileUtils.save(processed, `output/${newName}.json`);

            return true;
          },
          3,  // Max 3 retries
          `Processing ${file}`,
          new WaitExponentialDelay(100, 2, 1000)
        );
      });
    }

    await throttler.wait();
    console.log("All files processed successfully");
  }

  private async transform(data: any): Promise<any> {
    // Your transformation logic
    return data;
  }
}

// Usage
const processor = new DataProcessor("config.yaml");
await processor.processFiles("./input");

// Check state
const status = State.getStateStatus(processor);
console.log(`Status: ${status.state}`);
console.log(`Transitions: ${status.transitions.length}`);
```

## Module Overview

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| **case** | Naming convention transformation | `TransformCase()` |
| **duration** | Duration parsing and conversion | `Duration` class |
| **filesize** | File size parsing and formatting | `FileSize` class |
| **throttler** | Promise concurrency control | `Throttler` class |
| **waiter** | Retry logic and delays | `WaitFor()`, `sleep()`, delay strategies |
| **serializers** | File I/O with format detection | `FileUtils`, `JSONUtils`, `YAMLUtils` |
| **yamlproxy** | YAML comment preservation | `YAMLProxy` class |
| **jsoncparser** | JSON with comments support | JSONC parsing functions |
| **state** | State tracking decorator | `@State` decorator |
| **uuid** | UUID generation | `getUuid()` |
| **regexp** | String validation | `RegExpValidator`, `RegExpStringValidator` |
| **stream** | Stream utilities | `NDJSONStream`, `sanitizeFilename()` |
| **chdir** | Directory management | `runWithCurrentDirectory()` |
| **esm** | ESM utilities | `getCommonJS()` |

## Use Cases

### Configuration Management
Load configuration files from multiple formats (JSON, YAML, JSONC) with automatic format detection and comment preservation.

### API Development
Transform model names between different conventions for URLs, database fields, and environment variables.

### Batch Processing
Process large datasets with throttled concurrency and retry logic to prevent overwhelming system resources.

### File Operations
Walk directories, find files by pattern, handle compressed files, and preserve formatting in configuration files.

### Data Validation
Validate user input, API parameters, or configuration values with flexible regex patterns.

### Performance Monitoring
Track method execution states, measure durations, and record transitions for debugging and optimization.

## Package Information

- **Version:** 4.0.0-beta.1
- **License:** LGPL-3.0-only
- **Repository:** [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io)
- **Node.js:** >=22.0.0
- **Module Type:** ES Module (ESM)

## Next Steps

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Data Transformation](./data-transformation.md) - Case conversion, duration, file size utilities
- [Async Utilities](./async-utilities.md) - Throttling, retry logic, and promise management
- [File Operations](./file-operations.md) - Loading, saving, and processing files
- [Validation & State](./validation-state.md) - Input validation and state tracking
- [API Reference](./api-reference.md) - Complete API documentation

## Contributing

This package is part of the Webda.io project. Contributions are welcome!

## Support

- **Documentation:** [webda.io/docs](https://webda.io/docs)
- **Issues:** [GitHub Issues](https://github.com/loopingz/webda.io/issues)
- **Community:** Join our community for support and discussions
