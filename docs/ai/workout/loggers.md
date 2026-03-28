---
sidebar_position: 4
title: Loggers
description: Understanding different logger types and their use cases
---

# Loggers

`@webda/workout` provides several logger implementations, each designed for specific use cases. All loggers extend the `WorkerLogger` base class and listen to messages from `WorkerOutput`.

## Logger Architecture

```
┌──────────────┐
│ WorkerLogger │  ← Abstract base class
└──────┬───────┘
       │
   ┌───┴──────┬──────────┬─────────┬───────────┐
   │          │          │         │           │
┌──▼──────┐ ┌▼────────┐ ┌▼───────┐ ┌▼─────────┐ ┌▼────────┐
│Console  │ │Terminal │ │  File  │ │  Memory  │ │  Debug  │
│Logger   │ │         │ │ Logger │ │  Logger  │ │ Logger  │
└─────────┘ └─────────┘ └────────┘ └──────────┘ └─────────┘
```

## WorkerLogger (Base Class)

All loggers inherit from `WorkerLogger`, which provides common functionality.

### Properties

```typescript
abstract class WorkerLogger {
  level: WorkerLogLevel;      // Minimum log level to process
  output: WorkerOutput;       // Associated output instance
  listener: any;              // Event listener reference
}
```

### Methods

```typescript
// Abstract method - implement in subclasses
abstract onMessage(msg: WorkerMessage): void;

// Close and cleanup
close(): void;
```

### Usage Pattern

```typescript
import { WorkerOutput, ConsoleLogger } from '@webda/workout';

const output = new WorkerOutput();

// Create logger (automatically attaches to output)
const logger = new ConsoleLogger(output, 'INFO');

// Use output as normal
output.log('INFO', 'Message');

// Cleanup when done
logger.close();
```

## ConsoleLogger

Outputs formatted messages to the console with color-coding.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  format?: string
)
```

### Features

- Color-coded output based on log level
- Customizable format strings (sprintf-style)
- Handles progress updates
- Group indentation
- Input prompts

### Color Coding

- **ERROR** → Red
- **WARN** → Yellow
- **DEBUG/TRACE** → Grey
- **INFO** → Default color

### Format Strings

ConsoleLogger supports sprintf-style format strings:

```typescript
import { WorkerOutput, ConsoleLogger } from '@webda/workout';

const output = new WorkerOutput();

// Default format
new ConsoleLogger(output, 'INFO');

// Custom format with timestamp
const format = '[%d] %s';  // [timestamp] message
new ConsoleLogger(output, 'INFO', format);

// Custom format with level
const format = '[%s] %s';  // [LEVEL] message
new ConsoleLogger(output, 'INFO', format);
```

### Example

```typescript
import { WorkerOutput, ConsoleLogger } from '@webda/workout';

const output = new WorkerOutput();
const logger = new ConsoleLogger(output, 'DEBUG');

output.log('ERROR', 'Critical error occurred');     // Red
output.log('WARN', 'This is a warning');           // Yellow
output.log('INFO', 'Information message');          // Default
output.log('DEBUG', 'Debug information');           // Grey

// Progress updates are also displayed
output.startProgress('task', 100, 'Processing');
output.updateProgress(50, 'task');
output.closeProgress('task');

logger.close();
```

### Output Example

```
Critical error occurred  (in red)
This is a warning  (in yellow)
Information message
Debug information  (in grey)
Processing: 50/100 (50%)
Processing: Complete
```

## FileLogger

Writes log messages to a file with automatic log rotation.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  filepath: string,
  sizeLimit: number = 50 * 1024 * 1024,  // 50MB default
  format?: string
)
```

### Features

- Writes to file in append mode
- Automatic log rotation when size limit reached
- Timestamp-based rotation filenames
- Customizable format strings
- No color codes (plain text)

### Log Rotation

When the log file exceeds `sizeLimit`, it's automatically rotated:

```
app.log             → app.log.1234567890.log
                      (timestamp in filename)
```

New log entries continue in `app.log`.

### Example

```typescript
import { WorkerOutput, FileLogger } from '@webda/workout';

const output = new WorkerOutput();

// Log to file with 10MB size limit
const logger = new FileLogger(
  output,
  'INFO',
  './logs/app.log',
  10 * 1024 * 1024  // 10MB
);

output.log('INFO', 'Application started');
output.log('ERROR', 'An error occurred:', error);

// Progress updates are also logged
output.startProgress('task', 1000, 'Processing records');
for (let i = 0; i <= 1000; i += 100) {
  output.updateProgress(i, 'task');
}
output.closeProgress('task');

logger.close();
```

### Log File Content

```
Application started
An error occurred: Error message...
Processing records: 0/1000 (0%)
Processing records: 100/1000 (10%)
Processing records: 200/1000 (20%)
...
Processing records: Complete
```

### Custom Format

```typescript
// Add timestamps to each line
const format = '[%s] %s';  // [timestamp] message
const logger = new FileLogger(
  output,
  'INFO',
  './logs/app.log',
  50 * 1024 * 1024,
  format
);

// Log file output:
// [2026-01-28T10:30:45.123Z] Application started
// [2026-01-28T10:30:46.456Z] Processing complete
```

## MemoryLogger

Captures log messages in memory for testing or debugging.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  includeAll: boolean = false,
  limit: number = 2000
)
```

### Parameters

- **level** - Minimum log level to capture
- **includeAll** - If true, capture all message types (progress, groups, etc.), not just logs
- **limit** - Maximum messages to keep (FIFO queue)

### Features

- In-memory message storage
- Configurable message limit
- FIFO queue (oldest messages dropped)
- Can capture all messages or just logs
- Useful for testing
- Retrievable message history

### Methods

```typescript
class MemoryLogger extends WorkerLogger {
  // Get all captured messages
  getMessages(): WorkerMessage[];

  // Get only log messages
  getLogs(): WorkerLog[];

  // Clear all captured messages
  clear(): void;

  // Update log level filter
  setLogLevel(level: WorkerLogLevel): void;
}
```

### Example: Testing

```typescript
import { WorkerOutput, MemoryLogger } from '@webda/workout';
import { strict as assert } from 'assert';

// Setup
const output = new WorkerOutput();
const logger = new MemoryLogger(output, 'DEBUG', false, 1000);

// Run code
myFunction(output);

// Verify logs
const logs = logger.getLogs();
assert(logs.length > 0, 'Should have logged messages');
assert(logs.some(log =>
  log.level === 'ERROR' &&
  log.args[0] === 'Expected error message'
), 'Should have logged error');

logger.close();
```

### Example: Debugging

```typescript
import { WorkerOutput, MemoryLogger } from '@webda/workout';

const output = new WorkerOutput();

// Capture all messages including progress and groups
const logger = new MemoryLogger(output, 'TRACE', true);

// Run your code
await complexOperation(output);

// Retrieve and analyze
const messages = logger.getMessages();

console.log(`Total messages: ${messages.length}`);
console.log(`Log messages: ${logger.getLogs().length}`);

// Filter specific message types
const progressMessages = messages.filter(m =>
  m.type.startsWith('progress')
);
console.log(`Progress updates: ${progressMessages.length}`);

// Export for analysis
fs.writeFileSync(
  'debug-log.json',
  JSON.stringify(messages, null, 2)
);

logger.close();
```

### Example: Message History with Limit

```typescript
const logger = new MemoryLogger(output, 'INFO', false, 10);  // Keep only 10

// Log 20 messages
for (let i = 0; i < 20; i++) {
  output.log('INFO', `Message ${i}`);
}

const logs = logger.getLogs();
console.log(logs.length);  // 10 (oldest 10 were dropped)

// First message will be "Message 10" (0-9 were dropped)
console.log(logs[0].args[0]);  // "Message 10"
```

## DebugLogger

Specialized logger that captures all messages at full verbosity to a file.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  filepath: string
)
```

### Features

- Extends `FileLogger`
- Always logs at TRACE level (most verbose)
- Includes all message types (logs, progress, groups, input)
- No log level filtering
- Useful for comprehensive debugging
- Automatic log rotation

### Example

```typescript
import { WorkerOutput, ConsoleLogger, DebugLogger } from '@webda/workout';

const output = new WorkerOutput();

// Normal console output at INFO level
new ConsoleLogger(output, 'INFO');

// Complete debug log to file
const debugLogger = new DebugLogger(output, './logs/debug.log');

// User sees only INFO+ messages in console
// debug.log gets everything including TRACE and DEBUG
output.log('TRACE', 'Detailed trace information');  // Only in file
output.log('DEBUG', 'Debug details');               // Only in file
output.log('INFO', 'User message');                 // Console and file
output.log('ERROR', 'Error occurred');              // Console and file

debugLogger.close();
```

### Use Cases

1. **Production Debugging**
   ```typescript
   // Show minimal output to user
   new ConsoleLogger(output, 'WARN');

   // But capture everything to file for support
   new DebugLogger(output, './logs/full-debug.log');
   ```

2. **Development**
   ```typescript
   // Console for immediate feedback
   new Terminal(output, 'DEBUG');

   // File for detailed analysis
   new DebugLogger(output, './dev.log');
   ```

3. **Troubleshooting**
   ```typescript
   const output = new WorkerOutput();
   const debugLogger = new DebugLogger(output, './troubleshoot.log');

   // Run problematic code
   await problematicFunction(output);

   debugLogger.close();

   // Analyze ./troubleshoot.log for all details
   ```

## Terminal

Terminal provides a rich terminal UI. See [Terminal UI](./terminal-ui.md) for complete documentation.

### Quick Example

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

const output = new WorkerOutput();
const terminal = new Terminal(output, 'INFO');

output.setTitle('My Application');
output.log('INFO', 'Starting...');

const progress = output.startProgress('task', 100, 'Working');
// Animated progress bar displayed in terminal

terminal.close();
```

## Using Multiple Loggers

You can attach multiple loggers to the same `WorkerOutput` to route output to different destinations simultaneously.

### Example: Development Setup

```typescript
import {
  WorkerOutput,
  ConsoleLogger,
  FileLogger,
  MemoryLogger
} from '@webda/workout';

const output = new WorkerOutput();

// Console for immediate feedback (verbose)
const consoleLogger = new ConsoleLogger(output, 'DEBUG');

// File for persistent logs (less verbose)
const fileLogger = new FileLogger(output, 'INFO', './logs/app.log');

// Memory for testing assertions
const memLogger = new MemoryLogger(output, 'ERROR', false, 100);

// All loggers receive messages
output.log('TRACE', 'Trace');    // None
output.log('DEBUG', 'Debug');    // Console only
output.log('INFO', 'Info');      // Console + File
output.log('ERROR', 'Error');    // All three

// Cleanup
consoleLogger.close();
fileLogger.close();
memLogger.close();
```

### Example: Production Setup

```typescript
const output = new WorkerOutput();

// Minimal console output (errors and warnings only)
new ConsoleLogger(output, 'WARN');

// Standard application log
new FileLogger(output, 'INFO', './logs/app.log');

// Detailed debug log for support
new DebugLogger(output, './logs/debug.log');

// Emergency error-only log with small size
new FileLogger(
  output,
  'ERROR',
  './logs/errors.log',
  5 * 1024 * 1024  // 5MB
);
```

### Example: Testing Setup

```typescript
const output = new WorkerOutput();

// Capture everything for assertions
const logger = new MemoryLogger(output, 'TRACE', true, 10000);

// Run tests
await runTests(output);

// Verify behavior
const logs = logger.getLogs();
assert.strictEqual(
  logs.filter(l => l.level === 'ERROR').length,
  0,
  'Should have no errors'
);

logger.close();
```

## Custom Logger

Create custom loggers by extending `WorkerLogger`:

```typescript
import { WorkerLogger, WorkerMessage, WorkerLogLevel } from '@webda/workout';

class DatabaseLogger extends WorkerLogger {
  private db: Database;

  constructor(
    output: WorkerOutput,
    level: WorkerLogLevel,
    db: Database
  ) {
    super(output, level);
    this.db = db;
  }

  onMessage(msg: WorkerMessage): void {
    // Filter by log level
    if (msg.type === 'log') {
      const log = msg.context as WorkerLog;
      if (this.shouldLog(log.level)) {
        // Insert into database
        this.db.logs.insert({
          timestamp: msg.timestamp,
          level: log.level,
          message: log.args.join(' '),
          groups: msg.groups,
          progresses: Array.from(msg.progresses.keys())
        });
      }
    }
  }

  private shouldLog(level: WorkerLogLevel): boolean {
    return LogFilter(
      WorkerLogLevelEnum[level],
      WorkerLogLevelEnum[this.level]
    );
  }
}

// Usage
const output = new WorkerOutput();
const dbLogger = new DatabaseLogger(output, 'INFO', db);
```

## Logger Comparison

| Logger | Output | Rotation | Memory | Interactive | Use Case |
|--------|--------|----------|--------|-------------|----------|
| **ConsoleLogger** | Console | N/A | Low | No | Development, simple CLIs |
| **Terminal** | Terminal UI | N/A | Medium | Yes | Rich CLI applications |
| **FileLogger** | File | Yes | Low | No | Production logging |
| **MemoryLogger** | Memory | N/A | High | No | Testing, debugging |
| **DebugLogger** | File | Yes | Low | No | Comprehensive debugging |

## Best Practices

### 1. Choose Appropriate Log Levels

```typescript
// Development: verbose
new ConsoleLogger(output, 'DEBUG');

// Production: important only
new ConsoleLogger(output, 'INFO');

// Testing: capture everything
new MemoryLogger(output, 'TRACE', true);
```

### 2. Use Multiple Loggers for Different Purposes

```typescript
// User-facing output
new Terminal(output, 'INFO');

// Background logging
new FileLogger(output, 'DEBUG', './logs/app.log');

// Error tracking
new FileLogger(output, 'ERROR', './logs/errors.log', 10 * 1024 * 1024);
```

### 3. Always Close Loggers

```typescript
const logger = new ConsoleLogger(output, 'INFO');

try {
  // Use output
} finally {
  logger.close();
}
```

### 4. Configure Rotation for Long-Running Processes

```typescript
// Rotate every 100MB to prevent huge files
new FileLogger(
  output,
  'INFO',
  './logs/app.log',
  100 * 1024 * 1024
);
```

### 5. Use MemoryLogger for Testing

```typescript
import { test } from 'node:test';
import { strict as assert } from 'assert';

test('logs error on failure', async () => {
  const output = new WorkerOutput();
  const logger = new MemoryLogger(output, 'ERROR', false);

  await functionThatFails(output);

  const logs = logger.getLogs();
  assert(logs.some(log =>
    log.level === 'ERROR' &&
    log.args[0].includes('failure')
  ));

  logger.close();
});
```

## Next Steps

- [Terminal UI](./terminal-ui.md) - Detailed Terminal UI documentation
- [API Reference](./api-reference.md) - Complete API documentation
- [Advanced Usage](./advanced-usage.md) - Advanced patterns and techniques
