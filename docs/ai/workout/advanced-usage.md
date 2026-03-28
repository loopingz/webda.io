---
sidebar_position: 8
title: Advanced Usage
description: Advanced patterns and techniques for @webda/workout
---

# Advanced Usage

This guide covers advanced patterns, techniques, and best practices for using `@webda/workout` in complex applications.

## Custom Logger Implementation

Create specialized loggers for specific needs:

### Database Logger

```typescript
import {
  WorkerLogger,
  WorkerMessage,
  WorkerLogLevel,
  WorkerLog,
  WorkerLogLevelEnum,
  LogFilter
} from '@webda/workout';

interface LogRecord {
  timestamp: Date;
  level: string;
  message: string;
  groups: string[];
  metadata?: any;
}

class DatabaseLogger extends WorkerLogger {
  private db: DatabaseConnection;
  private buffer: LogRecord[] = [];
  private flushInterval: NodeJS.Timer;

  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    db: DatabaseConnection,
    bufferSize: number = 100,
    flushIntervalMs: number = 5000
  ) {
    super(output, level);
    this.db = db;

    // Flush buffer periodically
    this.flushInterval = setInterval(() => {
      this.flush();
    }, flushIntervalMs);

    // Flush when buffer is full
    this.bufferSize = bufferSize;
  }

  onMessage(msg: WorkerMessage): void {
    if (msg.type === 'log') {
      const log = msg.context as WorkerLog;

      // Check log level
      if (!LogFilter(
        WorkerLogLevelEnum[log.level],
        WorkerLogLevelEnum[this.level]
      )) {
        return;
      }

      // Buffer the log
      this.buffer.push({
        timestamp: new Date(msg.timestamp),
        level: log.level,
        message: log.args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        groups: [...msg.groups],
        metadata: this.extractMetadata(log.args)
      });

      // Flush if buffer full
      if (this.buffer.length >= this.bufferSize) {
        this.flush();
      }
    }
  }

  private extractMetadata(args: any[]): any {
    // Extract structured data from arguments
    const objects = args.filter(arg =>
      typeof arg === 'object' && arg !== null
    );
    return objects.length > 0 ? objects : undefined;
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const records = [...this.buffer];
    this.buffer = [];

    try {
      await this.db.logs.insertMany(records);
    } catch (error) {
      console.error('Failed to flush logs to database:', error);
      // Re-add to buffer or handle error
    }
  }

  close(): void {
    clearInterval(this.flushInterval);
    this.flush();  // Final flush
    super.close();
  }
}

// Usage
const output = new WorkerOutput();
const dbLogger = new DatabaseLogger(output, 'INFO', db, 100, 5000);

output.log('INFO', 'User logged in', { userId: 123, ip: '192.168.1.1' });
// Buffered and batch-inserted to database
```

### Metrics Logger

Track metrics and statistics:

```typescript
class MetricsLogger extends WorkerLogger {
  private metrics: Map<string, number> = new Map();
  private errorCount: number = 0;
  private warnCount: number = 0;
  private startTime: number = Date.now();

  onMessage(msg: WorkerMessage): void {
    if (msg.type === 'log') {
      const log = msg.context as WorkerLog;

      // Track error/warn counts
      if (log.level === 'ERROR') this.errorCount++;
      if (log.level === 'WARN') this.warnCount++;

      // Track custom metrics
      if (log.args[0] === 'METRIC') {
        const [, name, value] = log.args;
        this.metrics.set(name, value);
      }
    }

    if (msg.type === 'progress.stop') {
      const progress = msg.context as WorkerProgress;
      const duration = Date.now() - this.startTime;

      // Track progress completion time
      this.metrics.set(`${progress.uid}_duration`, duration);
    }
  }

  getMetrics(): object {
    return {
      uptime: Date.now() - this.startTime,
      errors: this.errorCount,
      warnings: this.warnCount,
      custom: Object.fromEntries(this.metrics)
    };
  }

  reset(): void {
    this.metrics.clear();
    this.errorCount = 0;
    this.warnCount = 0;
    this.startTime = Date.now();
  }
}

// Usage
const output = new WorkerOutput();
const metricsLogger = new MetricsLogger(output, 'INFO');

output.log('ERROR', 'Connection failed');
output.log('METRIC', 'requests_processed', 1234);
output.log('METRIC', 'average_response_time', 45.3);

console.log(metricsLogger.getMetrics());
// {
//   uptime: 10000,
//   errors: 1,
//   warnings: 0,
//   custom: { requests_processed: 1234, average_response_time: 45.3 }
// }
```

### Webhook Logger

Send logs to external services:

```typescript
class WebhookLogger extends WorkerLogger {
  private webhookUrl: string;
  private batchSize: number;
  private batch: any[] = [];

  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    webhookUrl: string,
    batchSize: number = 10
  ) {
    super(output, level);
    this.webhookUrl = webhookUrl;
    this.batchSize = batchSize;
  }

  onMessage(msg: WorkerMessage): void {
    if (msg.type === 'log') {
      const log = msg.context as WorkerLog;

      if (!LogFilter(
        WorkerLogLevelEnum[log.level],
        WorkerLogLevelEnum[this.level]
      )) {
        return;
      }

      this.batch.push({
        timestamp: msg.timestamp,
        level: log.level,
        message: log.args,
        groups: msg.groups
      });

      if (this.batch.length >= this.batchSize) {
        this.send();
      }
    }
  }

  private async send(): Promise<void> {
    if (this.batch.length === 0) return;

    const payload = [...this.batch];
    this.batch = [];

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: payload })
      });
    } catch (error) {
      console.error('Failed to send logs to webhook:', error);
    }
  }

  close(): void {
    this.send();  // Send remaining logs
    super.close();
  }
}
```

## Advanced Progress Patterns

### Nested Progress Tracking

Track progress of sub-tasks:

```typescript
class ProgressManager {
  constructor(private output: WorkerOutput) {}

  async processWithSubtasks<T>(
    mainTask: string,
    subtasks: Array<{
      name: string;
      weight: number;
      fn: () => Promise<T>;
    }>
  ): Promise<T[]> {
    const totalWeight = subtasks.reduce((sum, t) => sum + t.weight, 0);
    this.output.startProgress(mainTask, totalWeight, 'Processing');

    let currentWeight = 0;
    const results: T[] = [];

    for (const subtask of subtasks) {
      this.output.log('DEBUG', `Starting subtask: ${subtask.name}`);

      const result = await subtask.fn();
      results.push(result);

      currentWeight += subtask.weight;
      this.output.updateProgress(
        currentWeight,
        mainTask,
        `Completed ${subtask.name}`
      );
    }

    this.output.closeProgress(mainTask);
    return results;
  }
}

// Usage
const manager = new ProgressManager(output);

await manager.processWithSubtasks('build', [
  { name: 'compile', weight: 50, fn: async () => await compile() },
  { name: 'bundle', weight: 30, fn: async () => await bundle() },
  { name: 'minify', weight: 20, fn: async () => await minify() }
]);

// Progress shows: 0% → 50% (compile) → 80% (bundle) → 100% (minify)
```

### Progress Aggregation

Aggregate multiple progress indicators:

```typescript
class AggregateProgress {
  private progresses: Map<string, { current: number; total: number }> = new Map();
  private aggregateUid: string;

  constructor(private output: WorkerOutput, aggregateUid: string) {
    this.aggregateUid = aggregateUid;
  }

  add(uid: string, total: number): void {
    this.progresses.set(uid, { current: 0, total });
    this.updateAggregate();
  }

  update(uid: string, current: number): void {
    const progress = this.progresses.get(uid);
    if (progress) {
      progress.current = current;
      this.updateAggregate();
    }
  }

  private updateAggregate(): void {
    let totalCurrent = 0;
    let totalMax = 0;

    for (const progress of this.progresses.values()) {
      totalCurrent += progress.current;
      totalMax += progress.total;
    }

    if (totalMax > 0) {
      this.output.updateProgress(
        totalCurrent,
        this.aggregateUid,
        `Overall progress: ${Math.round((totalCurrent / totalMax) * 100)}%`
      );
    }
  }

  remove(uid: string): void {
    this.progresses.delete(uid);
    this.updateAggregate();
  }
}

// Usage
const output = new WorkerOutput();
new Terminal(output);

output.startProgress('overall', 1000, 'Overall Progress');
const aggregate = new AggregateProgress(output, 'overall');

// Track multiple tasks
aggregate.add('download', 500);
aggregate.add('process', 300);
aggregate.add('upload', 200);

// Update individual tasks
aggregate.update('download', 250);  // Overall: 25%
aggregate.update('process', 150);   // Overall: 40%
aggregate.update('upload', 100);    // Overall: 50%
```

### Throttled Progress Updates

Avoid overwhelming the terminal with updates:

```typescript
class ThrottledProgress {
  private lastUpdate: number = 0;
  private throttleMs: number;

  constructor(
    private output: WorkerOutput,
    private uid: string,
    throttleMs: number = 100
  ) {
    this.throttleMs = throttleMs;
  }

  update(current: number, title?: string): void {
    const now = Date.now();

    if (now - this.lastUpdate >= this.throttleMs) {
      this.output.updateProgress(current, this.uid, title);
      this.lastUpdate = now;
    }
  }

  forceUpdate(current: number, title?: string): void {
    this.output.updateProgress(current, this.uid, title);
    this.lastUpdate = Date.now();
  }
}

// Usage
const progress = new ThrottledProgress(output, 'download', 100);

// Fast loop - updates throttled to every 100ms
for (let i = 0; i <= 1000; i++) {
  await processItem(i);
  progress.update(i);  // Only updates every 100ms
}

// Force final update
progress.forceUpdate(1000, 'Complete');
```

## Context Management

### Scoped Output

Create context-specific output instances:

```typescript
class ScopedOutput {
  constructor(
    private output: WorkerOutput,
    private scope: string,
    private metadata: Record<string, any> = {}
  ) {}

  log(level: WorkerLogLevel, ...args: any[]): void {
    this.output.log(level, `[${this.scope}]`, ...args);
  }

  startProgress(uid: string, total: number, title?: string): WorkerProgress {
    return this.output.startProgress(
      `${this.scope}:${uid}`,
      total,
      title || `${this.scope} - ${uid}`
    );
  }

  updateProgress(current: number, uid: string, title?: string): void {
    this.output.updateProgress(current, `${this.scope}:${uid}`, title);
  }

  closeProgress(uid: string): void {
    this.output.closeProgress(`${this.scope}:${uid}`);
  }

  createChild(childScope: string): ScopedOutput {
    return new ScopedOutput(
      this.output,
      `${this.scope}:${childScope}`,
      this.metadata
    );
  }

  withGroup<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    this.output.openGroup(`${this.scope}:${name}`);
    try {
      return fn();
    } finally {
      this.output.closeGroup();
    }
  }
}

// Usage
const output = new WorkerOutput();
new Terminal(output);

const apiScope = new ScopedOutput(output, 'API');
apiScope.log('INFO', 'Server starting');
apiScope.startProgress('requests', 1000, 'Processing requests');

const dbScope = new ScopedOutput(output, 'DB');
dbScope.log('INFO', 'Connecting to database');

// Creates child scope: DB:migrations
const migrationsScope = dbScope.createChild('migrations');
migrationsScope.log('INFO', 'Running migration 001');

// Output:
// [API] Server starting
// [DB] Connecting to database
// [DB:migrations] Running migration 001
```

### Async Context Tracking

Track context across async operations:

```typescript
import { AsyncLocalStorage } from 'async_hooks';

interface OutputContext {
  requestId: string;
  userId?: string;
  scope: string;
}

class ContextualOutput {
  private storage = new AsyncLocalStorage<OutputContext>();

  constructor(private output: WorkerOutput) {}

  runWithContext<T>(
    context: OutputContext,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    return this.storage.run(context, fn);
  }

  log(level: WorkerLogLevel, ...args: any[]): void {
    const context = this.storage.getStore();
    if (context) {
      this.output.log(
        level,
        `[${context.requestId}]`,
        `[${context.scope}]`,
        ...args
      );
    } else {
      this.output.log(level, ...args);
    }
  }

  getContext(): OutputContext | undefined {
    return this.storage.getStore();
  }
}

// Usage
const output = new WorkerOutput();
new ConsoleLogger(output, 'INFO');

const contextOutput = new ContextualOutput(output);

async function handleRequest(requestId: string) {
  await contextOutput.runWithContext(
    { requestId, scope: 'API' },
    async () => {
      contextOutput.log('INFO', 'Request received');

      await processRequest();

      contextOutput.log('INFO', 'Request completed');
    }
  );
}

await handleRequest('req-123');
// Output:
// [req-123] [API] Request received
// [req-123] [API] Request completed
```

## Testing Patterns

### Mock Output for Testing

```typescript
class MockOutput extends WorkerOutput {
  public logs: Array<{ level: string; args: any[] }> = [];
  public progresses: Map<string, { current: number; total: number }> = new Map();

  log(level: WorkerLogLevel, ...args: any[]): void {
    this.logs.push({ level, args });
    super.log(level, ...args);
  }

  startProgress(uid: string, total: number, title?: string): WorkerProgress {
    this.progresses.set(uid, { current: 0, total });
    return super.startProgress(uid, total, title);
  }

  updateProgress(current: number, uid?: string, title?: string): void {
    if (uid && this.progresses.has(uid)) {
      this.progresses.get(uid)!.current = current;
    }
    super.updateProgress(current, uid, title);
  }

  // Test helpers
  getLogsByLevel(level: string): Array<{ level: string; args: any[] }> {
    return this.logs.filter(log => log.level === level);
  }

  getProgressRatio(uid: string): number {
    const progress = this.progresses.get(uid);
    return progress ? progress.current / progress.total : 0;
  }

  reset(): void {
    this.logs = [];
    this.progresses.clear();
  }
}

// Usage in tests
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('logs errors on failure', async () => {
    const output = new MockOutput();

    await myFunction(output);

    const errors = output.getLogsByLevel('ERROR');
    expect(errors).toHaveLength(1);
    expect(errors[0].args[0]).toContain('Failed');
  });

  it('tracks progress correctly', async () => {
    const output = new MockOutput();

    await processItems(output, 100);

    expect(output.getProgressRatio('process')).toBe(1.0);
  });
});
```

### Snapshot Testing

```typescript
import { MemoryLogger } from '@webda/workout';

describe('Output Snapshots', () => {
  it('matches expected output', () => {
    const output = new WorkerOutput();
    const logger = new MemoryLogger(output, 'INFO', true);

    // Run your code
    myFunction(output);

    // Get all messages
    const messages = logger.getMessages();

    // Serialize for snapshot
    const snapshot = messages.map(msg => ({
      type: msg.type,
      level: msg.context?.level,
      args: msg.context?.args
    }));

    expect(snapshot).toMatchSnapshot();
  });
});
```

## Performance Optimization

### Lazy Logger Initialization

```typescript
class LazyLoggerManager {
  private loggers: Map<string, WorkerLogger> = new Map();
  private output: WorkerOutput;

  constructor(output: WorkerOutput) {
    this.output = output;
  }

  getLogger(name: string, factory: () => WorkerLogger): WorkerLogger {
    if (!this.loggers.has(name)) {
      this.loggers.set(name, factory());
    }
    return this.loggers.get(name)!;
  }

  closeAll(): void {
    for (const logger of this.loggers.values()) {
      logger.close();
    }
    this.loggers.clear();
  }
}

// Usage
const output = new WorkerOutput();
const manager = new LazyLoggerManager(output);

// File logger only created when first used
const fileLogger = manager.getLogger('file', () =>
  new FileLogger(output, 'INFO', './app.log')
);

// Debug logger only created in debug mode
if (process.env.DEBUG) {
  manager.getLogger('debug', () =>
    new DebugLogger(output, './debug.log')
  );
}
```

### Conditional Logging

```typescript
class ConditionalLogger {
  constructor(
    private output: WorkerOutput,
    private shouldLog: (level: WorkerLogLevel, ...args: any[]) => boolean
  ) {}

  log(level: WorkerLogLevel, ...args: any[]): void {
    if (this.shouldLog(level, ...args)) {
      this.output.log(level, ...args);
    }
  }
}

// Usage
const output = new WorkerOutput();

// Only log in production
const productionLogger = new ConditionalLogger(
  output,
  (level) => process.env.NODE_ENV === 'production'
);

// Only log errors and warnings
const errorLogger = new ConditionalLogger(
  output,
  (level) => level === 'ERROR' || level === 'WARN'
);

// Sample-based logging (1%)
const sampledLogger = new ConditionalLogger(
  output,
  () => Math.random() < 0.01
);
```

## Integration Patterns

### Express.js Middleware

```typescript
import express from 'express';
import { WorkerOutput, FileLogger } from '@webda/workout';

const output = new WorkerOutput();
new FileLogger(output, 'INFO', './logs/requests.log');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || generateId();

  output.log('INFO', `[${requestId}] ${req.method} ${req.path}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    output.log('INFO', `[${requestId}] ${res.statusCode} ${duration}ms`);
  });

  req.output = output;
  next();
};

const app = express();
app.use(requestLogger);

app.get('/process', async (req, res) => {
  const progress = req.output.startProgress('process', 100, 'Processing');

  for (let i = 0; i <= 100; i += 10) {
    await doWork(i);
    req.output.updateProgress(i, 'process');
  }

  req.output.closeProgress('process');
  res.json({ success: true });
});
```

### CLI with Commander.js

```typescript
import { Command } from 'commander';
import { WorkerOutput, Terminal } from '@webda/workout';

const program = new Command();

program
  .name('my-cli')
  .version('1.0.0')
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'quiet output');

program
  .command('process <file>')
  .description('Process a file')
  .action(async (file, options) => {
    const output = new WorkerOutput();
    const level = options.verbose ? 'DEBUG' : options.quiet ? 'WARN' : 'INFO';
    const terminal = new Terminal(output, level);

    try {
      output.log('INFO', `Processing ${file}`);

      const progress = output.startProgress('process', 100, 'Working');
      await processFile(file, (p) => output.updateProgress(p, 'process'));
      output.closeProgress('process');

      output.log('INFO', 'Complete');
    } catch (error) {
      output.log('ERROR', 'Failed:', error.message);
      process.exit(1);
    } finally {
      terminal.close();
    }
  });

program.parse();
```

### WebSocket Progress Streaming

```typescript
import { WebSocket } from 'ws';
import { WorkerOutput, WorkerMessage } from '@webda/workout';

class WebSocketLogger extends WorkerLogger {
  constructor(
    output: WorkerOutput,
    private ws: WebSocket
  ) {
    super(output, 'INFO');
  }

  onMessage(msg: WorkerMessage): void {
    // Send message to connected clients
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: msg.type,
        timestamp: msg.timestamp,
        data: this.serializeContext(msg)
      }));
    }
  }

  private serializeContext(msg: WorkerMessage): any {
    if (msg.type === 'log') {
      const log = msg.context as WorkerLog;
      return { level: log.level, message: log.args };
    }
    if (msg.type.startsWith('progress')) {
      const progress = msg.context as WorkerProgress;
      return {
        uid: progress.uid,
        current: progress.current,
        total: progress.total,
        ratio: progress.getRatio()
      };
    }
    return msg.context;
  }
}

// Server
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  const output = new WorkerOutput();
  const wsLogger = new WebSocketLogger(output, ws);

  // Run long process, updates streamed to client
  processLongTask(output);

  ws.on('close', () => wsLogger.close());
});

// Client
const ws = new WebSocket('ws://localhost:8080');

ws.on('message', (data) => {
  const msg = JSON.parse(data);

  if (msg.type === 'progress.update') {
    console.log(`Progress: ${msg.data.ratio * 100}%`);
  }
  if (msg.type === 'log') {
    console.log(`[${msg.data.level}] ${msg.data.message}`);
  }
});
```

## Best Practices Summary

### 1. Always Clean Up
```typescript
const terminal = new Terminal(output);
try {
  // Your code
} finally {
  terminal.close();  // Essential
}
```

### 2. Use Appropriate Log Levels
```typescript
output.log('ERROR', 'Critical failures only');
output.log('WARN', 'Warnings that should be reviewed');
output.log('INFO', 'Important business events');
output.log('DEBUG', 'Detailed diagnostic information');
output.log('TRACE', 'Very detailed trace information');
```

### 3. Throttle Progress Updates
```typescript
// Don't update on every iteration
for (let i = 0; i < 1000000; i++) {
  if (i % 1000 === 0) {  // Update every 1000 items
    output.updateProgress(i, 'task');
  }
}
```

### 4. Use Groups for Context
```typescript
output.openGroup('operation');
try {
  // Related operations
} finally {
  output.closeGroup();
}
```

### 5. Validate Input Properly
```typescript
const email = await output.requestInput(
  'Email:',
  'STRING',
  /^[\w.+-]+@[\w.-]+\.\w+$/,
  30000
);
```

### 6. Handle Errors Gracefully
```typescript
try {
  const result = await output.requestInput('Value:', 'STRING', /^\d+$/, 5000);
} catch (error) {
  output.log('WARN', 'Input timeout, using default value');
  // Fallback logic
}
```

## Next Steps

- [Getting Started](./getting-started.md) - Basic usage guide
- [API Reference](./api-reference.md) - Complete API documentation
- [Core Concepts](./core-concepts.md) - Architecture and design
