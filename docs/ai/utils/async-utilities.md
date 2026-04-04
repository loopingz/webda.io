---
sidebar_position: 4
title: Async Utilities
description: Promise throttling, retry logic, and async helpers
---

# Async Utilities

This guide covers utilities for managing asynchronous operations: throttling concurrent promises, implementing retry logic, and handling timeouts.

## Throttler

The `Throttler` class controls how many promises execute concurrently, preventing resource exhaustion.

### Class Definition

```typescript
class Throttler {
  constructor(concurrency: number = 1, failFast: boolean = false);

  queue<T>(method: () => Promise<T>, name?: string): Promise<T>;
  execute<T>(method: () => Promise<T>, name?: string): Promise<T>;
  wait(): Promise<void>;
  setConcurrency(concurrency: number): void;
  getInProgress(): Array<{ name?: string; promise: Promise<any> }>;

  static run<T>(
    methods: Array<() => Promise<T>>,
    concurrency: number
  ): Promise<T[]>;
}
```

### Basic Usage

```typescript
import { Throttler } from '@webda/utils';

// Create throttler with max 5 concurrent operations
const throttler = new Throttler(5);

// Queue operations
for (let i = 0; i < 100; i++) {
  throttler.queue(async () => {
    await processItem(i);
  });
}

// Wait for all to complete
await throttler.wait();
console.log("All operations complete");
```

### Named Operations

Track operations with descriptive names:

```typescript
const throttler = new Throttler(10);

for (const url of urls) {
  throttler.queue(
    async () => {
      const response = await fetch(url);
      return response.json();
    },
    `fetch-${url}`  // Name for tracking
  );
}

// Check what's running
const inProgress = throttler.getInProgress();
console.log("Currently running:");
inProgress.forEach(op => console.log(`  - ${op.name}`));

await throttler.wait();
```

### Error Handling

**Fail-Safe Mode** (default): Continue processing even if some operations fail.

```typescript
const throttler = new Throttler(5, false);  // failFast = false

const results = [];
for (let i = 0; i < 10; i++) {
  const promise = throttler.queue(async () => {
    if (i === 5) throw new Error("Item 5 failed");
    return `Result ${i}`;
  });

  promise.catch(error => {
    console.error(`Operation failed: ${error.message}`);
  });

  results.push(promise);
}

await throttler.wait();

// Some operations succeeded, some failed
const successful = await Promise.allSettled(results);
console.log(`Successful: ${successful.filter(r => r.status === 'fulfilled').length}`);
```

**Fail-Fast Mode**: Stop all operations on first failure.

```typescript
const throttler = new Throttler(5, true);  // failFast = true

try {
  for (let i = 0; i < 10; i++) {
    throttler.queue(async () => {
      if (i === 5) throw new Error("Item 5 failed");
      return `Result ${i}`;
    });
  }

  await throttler.wait();
} catch (error) {
  console.error("Processing stopped:", error.message);
  // No more operations will be queued or executed
}
```

### Dynamic Concurrency

Adjust concurrency during execution:

```typescript
const throttler = new Throttler(5);

// Start with low concurrency
for (let i = 0; i < 50; i++) {
  throttler.queue(async () => await process(i));
}

// Increase concurrency after warmup
setTimeout(() => {
  throttler.setConcurrency(20);
  console.log("Increased concurrency to 20");
}, 5000);

await throttler.wait();
```

### Static Method for One-Time Use

```typescript
import { Throttler } from '@webda/utils';

const operations = urls.map(url => async () => {
  const response = await fetch(url);
  return response.json();
});

// Run with max 10 concurrent
const results = await Throttler.run(operations, 10);
console.log(`Fetched ${results.length} results`);
```

### Common Use Cases

#### Batch API Requests

```typescript
class APIBatchProcessor {
  private throttler: Throttler;

  constructor(concurrency: number = 10) {
    this.throttler = new Throttler(concurrency);
  }

  async fetchAll(ids: string[]): Promise<any[]> {
    const results: any[] = [];

    for (const id of ids) {
      const promise = this.throttler.queue(async () => {
        const response = await fetch(`/api/items/${id}`);
        return response.json();
      }, `fetch-${id}`);

      promise.then(data => results.push(data));
    }

    await this.throttler.wait();
    return results;
  }
}

const processor = new APIBatchProcessor(15);
const data = await processor.fetchAll(itemIds);
```

#### Database Migrations

```typescript
async function migrateRecords(records: any[], batchSize: number = 100) {
  const throttler = new Throttler(10);
  let processed = 0;

  for (const record of records) {
    throttler.queue(async () => {
      await db.migrate(record);
      processed++;

      if (processed % batchSize === 0) {
        console.log(`Migrated ${processed}/${records.length} records`);
      }
    });
  }

  await throttler.wait();
  console.log(`Migration complete: ${processed} records`);
}
```

#### File Processing

```typescript
async function processFiles(directory: string, maxConcurrent: number = 5) {
  const files = await readdir(directory);
  const throttler = new Throttler(maxConcurrent);

  for (const file of files) {
    throttler.queue(async () => {
      const data = await readFile(path.join(directory, file));
      const processed = await transform(data);
      await writeFile(path.join('output', file), processed);
    }, file);
  }

  await throttler.wait();
}
```

## Wait and Retry Utilities

### sleep()

Simple promise-based delay:

```typescript
import { sleep } from '@webda/utils';

console.log("Starting...");
await sleep(2000);  // Wait 2 seconds
console.log("After 2 seconds");

// Use in loops
for (let i = 0; i < 5; i++) {
  console.log(`Iteration ${i}`);
  await sleep(1000);  // 1 second between iterations
}
```

### nextTick()

Wait for the next event loop tick(s):

```typescript
import { nextTick } from '@webda/utils';

// Wait for 1 tick
await nextTick();

// Wait for multiple ticks
await nextTick(5);  // Wait 5 ticks
```

### WaitFor()

Retry an operation until it succeeds or max retries reached:

```typescript
import { WaitFor } from '@webda/utils';

const result = await WaitFor(
  async (resolve, reject) => {
    const success = await checkCondition();
    if (success) {
      resolve(true);
    } else {
      reject(new Error("Not ready yet"));
    }
  },
  10,  // Max 10 retries
  "Waiting for condition"
);
```

**Simplified syntax** (return boolean):

```typescript
await WaitFor(
  async () => {
    return await checkCondition();  // Return true when done
  },
  10,
  "Waiting for condition"
);
```

### Delay Strategies

#### WaitLinearDelay

Constant delay between retries:

```typescript
import { WaitFor, WaitLinearDelay } from '@webda/utils';

await WaitFor(
  async () => await checkStatus(),
  20,
  "Checking status",
  new WaitLinearDelay(1000)  // Wait 1s between each retry
);

// Retry timeline: 0s, 1s, 2s, 3s, 4s, ...
```

#### WaitExponentialDelay

Exponential backoff with configurable multiplier and max delay:

```typescript
import { WaitFor, WaitExponentialDelay } from '@webda/utils';

await WaitFor(
  async () => await connectToService(),
  10,
  "Connecting to service",
  new WaitExponentialDelay(
    100,   // Initial delay: 100ms
    2,     // Multiplier: 2x each retry
    5000   // Max delay: 5s
  )
);

// Retry timeline:
// Attempt 1: immediate
// Attempt 2: +100ms
// Attempt 3: +200ms (100 * 2)
// Attempt 4: +400ms (200 * 2)
// Attempt 5: +800ms (400 * 2)
// Attempt 6: +1600ms (800 * 2)
// Attempt 7: +3200ms (1600 * 2)
// Attempt 8: +5000ms (capped at max)
// Attempt 9: +5000ms (capped at max)
```

### Custom Delay Strategy

Create custom delay strategies:

```typescript
import { WaitDelayer, WaitDelayerFactories } from '@webda/utils';

class FibonacciDelay extends WaitDelayer {
  private prev = 0;
  private curr = 100;

  async wait(): Promise<void> {
    await sleep(this.curr);
    const next = this.prev + this.curr;
    this.prev = this.curr;
    this.curr = next;
  }
}

// Register factory
WaitDelayerFactories.set("fibonacci", () => new FibonacciDelay());

// Use it
await WaitFor(
  async () => await checkCondition(),
  10,
  "Waiting",
  new FibonacciDelay()
);

// Retry timeline: 100ms, 100ms, 200ms, 300ms, 500ms, 800ms, ...
```

### Common Retry Patterns

#### HTTP Request with Retry

```typescript
async function fetchWithRetry(
  url: string,
  maxRetries: number = 3
): Promise<Response> {
  return WaitFor(
    async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    },
    maxRetries,
    `Fetching ${url}`,
    new WaitExponentialDelay(1000, 2, 10000)
  );
}

const response = await fetchWithRetry("https://api.example.com/data");
```

#### Database Connection

```typescript
async function connectWithRetry(
  connectionString: string,
  maxRetries: number = 5
): Promise<Connection> {
  return WaitFor(
    async () => {
      try {
        const conn = await connect(connectionString);
        await conn.ping();  // Verify connection
        return conn;
      } catch (error) {
        console.log("Connection failed, retrying...");
        throw error;
      }
    },
    maxRetries,
    "Connecting to database",
    new WaitExponentialDelay(500, 2, 30000)
  );
}

const db = await connectWithRetry("postgresql://localhost/mydb");
```

#### Polling for Status

```typescript
async function waitForJobCompletion(
  jobId: string,
  timeout: number = 300000  // 5 minutes
): Promise<JobResult> {
  const startTime = Date.now();

  return WaitFor(
    async () => {
      if (Date.now() - startTime > timeout) {
        throw new Error("Job timeout");
      }

      const status = await checkJobStatus(jobId);

      if (status.state === "completed") {
        return status.result;
      } else if (status.state === "failed") {
        throw new Error(`Job failed: ${status.error}`);
      }

      // Still running, throw to retry
      throw new Error("Job still running");
    },
    100,  // Max 100 polls
    `Waiting for job ${jobId}`,
    new WaitLinearDelay(3000)  // Poll every 3 seconds
  );
}

const result = await waitForJobCompletion("job-123");
```

## Cancelable Promises

### CancelablePromise

Create promises that can be cancelled:

```typescript
import { CancelablePromise } from '@webda/utils';

const promise = new CancelablePromise(async (resolve, reject) => {
  // Long-running operation
  const result = await processData();
  resolve(result);
});

// Cancel if needed
setTimeout(() => {
  promise.cancel();
}, 5000);

try {
  const result = await promise;
  console.log("Completed:", result);
} catch (error) {
  if (error.message === "Promise cancelled") {
    console.log("Operation was cancelled");
  }
}
```

### CancelableLoopPromise

Create cancellable loops:

```typescript
import { CancelableLoopPromise } from '@webda/utils';

const loop = new CancelableLoopPromise(async () => {
  await doPeriodicTask();
  await sleep(1000);
}, 1000);  // Run every 1000ms

// Start the loop
loop.start();

// Stop after 10 seconds
setTimeout(() => {
  loop.cancel();
}, 10000);

// Wait for loop to finish
await loop;
```

## Combining Utilities

Use multiple utilities together for robust async operations:

```typescript
import {
  Throttler,
  WaitFor,
  WaitExponentialDelay,
  Duration,
  sleep
} from '@webda/utils';

class ResilientProcessor {
  private throttler: Throttler;
  private timeout: Duration;

  constructor(concurrency: number, timeout: string) {
    this.throttler = new Throttler(concurrency);
    this.timeout = new Duration(timeout);
  }

  async processItems(items: any[]): Promise<any[]> {
    const results: any[] = [];
    const startTime = Date.now();

    for (const item of items) {
      // Check global timeout
      if (this.timeout.expired(startTime)) {
        throw new Error("Processing timeout exceeded");
      }

      // Throttle and retry with exponential backoff
      const promise = this.throttler.queue(async () => {
        return WaitFor(
          async () => {
            // Rate limiting
            await sleep(100);

            // Process with timeout check
            if (this.timeout.expired(startTime)) {
              throw new Error("Timeout");
            }

            return await this.processItem(item);
          },
          3,  // Max 3 retries
          `Processing item ${item.id}`,
          new WaitExponentialDelay(100, 2, 2000)
        );
      }, `item-${item.id}`);

      promise.then(result => results.push(result));
    }

    await this.throttler.wait();
    return results;
  }

  private async processItem(item: any): Promise<any> {
    // Your processing logic
    return item;
  }
}

const processor = new ResilientProcessor(10, "5m");
const results = await processor.processItems(items);
```

## Best Practices

### 1. Choose Appropriate Concurrency

```typescript
// CPU-intensive: Limited by cores
const cpuThrottler = new Throttler(os.cpus().length);

// I/O-intensive: Higher concurrency
const ioThrottler = new Throttler(50);

// API with rate limits: Match API limits
const apiThrottler = new Throttler(10);
```

### 2. Use Exponential Backoff for External Services

```typescript
// Good: Exponential backoff reduces load on failing service
await WaitFor(
  async () => await externalAPI.call(),
  5,
  "API call",
  new WaitExponentialDelay(1000, 2, 30000)
);

// Bad: Linear delay hammers failing service
await WaitFor(
  async () => await externalAPI.call(),
  5,
  "API call",
  new WaitLinearDelay(1000)
);
```

### 3. Set Reasonable Timeouts

```typescript
// Good: Fail fast to prevent resource exhaustion
const timeout = new Duration("30s");
const start = Date.now();

await WaitFor(
  async () => {
    if (timeout.expired(start)) {
      throw new Error("Operation timeout");
    }
    return await operation();
  },
  10,
  "Operation"
);
```

### 4. Handle Errors Gracefully

```typescript
const throttler = new Throttler(10);
const errors: Error[] = [];

for (const item of items) {
  throttler.queue(async () => {
    try {
      await process(item);
    } catch (error) {
      errors.push(error);
      console.error(`Failed to process ${item.id}:`, error);
    }
  });
}

await throttler.wait();

if (errors.length > 0) {
  console.warn(`${errors.length} operations failed`);
}
```

## Next Steps

- [File Operations](./file-operations.md) - File I/O and serialization
- [Validation & State](./validation-state.md) - Input validation and state tracking
- [API Reference](./api-reference.md) - Complete API documentation
