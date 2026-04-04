---
sidebar_position: 3
title: Core Concepts
description: Understanding the core concepts of @webda/workout
---

# Core Concepts

This guide explains the core concepts and architecture of `@webda/workout`.

## Architecture Overview

`@webda/workout` follows an event-driven architecture where a central `WorkerOutput` class emits messages that are processed by various logger implementations:

```
┌─────────────────────────────────┐
│        Your Application         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│        WorkerOutput             │
│      (EventEmitter)             │
│  • Logs                         │
│  • Progress                     │
│  • Groups                       │
│  • Input Requests               │
└────────────┬────────────────────┘
             │
             │ emits WorkerMessage events
             │
    ┌────────┴──────────────┬─────────────┬──────────┐
    ▼                       ▼             ▼          ▼
┌─────────┐          ┌──────────┐   ┌─────────┐  ┌──────────┐
│Console  │          │Terminal  │   │  File   │  │  Memory  │
│ Logger  │          │    UI    │   │ Logger  │  │  Logger  │
└─────────┘          └──────────┘   └─────────┘  └──────────┘
```

This decoupling allows you to:
- Write application logic once, independent of output destination
- Route output to multiple destinations simultaneously
- Swap output implementations without changing application code
- Test applications by capturing output in memory

## WorkerOutput

`WorkerOutput` is the central class that your application interacts with. It extends Node.js's `EventEmitter` and provides methods for logging, progress tracking, grouping, and user input.

### Creating an Instance

```typescript
import { WorkerOutput } from '@webda/workout';

const output = new WorkerOutput();
```

### Key Properties

```typescript
class WorkerOutput extends EventEmitter {
  // Map of active progress indicators
  progresses: Map<string, WorkerProgress>;

  // Stack of currently open groups
  groups: string[];

  // Whether interactive input is enabled
  interactive: boolean;

  // Current title
  title: string;
}
```

### Logging Methods

```typescript
// Log at specific levels
output.log('ERROR', 'Critical error:', error);
output.log('WARN', 'Warning message');
output.log('INFO', 'Information');
output.log('DEBUG', 'Debug details');
output.log('TRACE', 'Trace information');

// Pass multiple arguments (like console.log)
output.log('INFO', 'User:', user.name, 'logged in at', new Date());

// Log objects
output.log('DEBUG', 'Config:', { host: 'localhost', port: 3000 });
```

### Progress Methods

```typescript
// Start a progress indicator
output.startProgress(
  uid: string,        // Unique identifier
  total: number,      // Total items/steps
  title?: string      // Display title
): WorkerProgress;

// Update progress to a specific value
output.updateProgress(
  current: number,    // Current progress value
  uid?: string,       // Progress ID (optional if only one progress)
  title?: string      // Update title (optional)
): void;

// Increment progress by an amount
output.incrementProgress(
  inc: number,        // Amount to increment by
  uid?: string,       // Progress ID (optional if only one progress)
  title?: string      // Update title (optional)
): void;

// Close/complete a progress indicator
output.closeProgress(uid?: string): void;
```

### Grouping Methods

```typescript
// Open a new group
output.openGroup(name: string): void;

// Close the current group
output.closeGroup(): void;

// Example with nested groups
output.openGroup('database');
output.log('INFO', 'Connecting...');
  output.openGroup('migrations');
  output.log('INFO', 'Running migration 001');
  output.log('INFO', 'Running migration 002');
  output.closeGroup();
output.log('INFO', 'Connected');
output.closeGroup();
```

### Input Methods

```typescript
// Request user input
output.requestInput(
  title: string,           // Prompt message
  type: WorkerInputType,   // STRING, PASSWORD, CONFIRMATION, LIST
  regexp?: RegExp,         // Validation pattern
  waitFor?: number,        // Timeout in milliseconds
  timeout?: number         // Alternative timeout parameter
): Promise<string>;

// Enable/disable interactive mode
output.setInteractive(interactive: boolean): void;

// Set application title
output.setTitle(title: string): void;
```

### Example Usage

```typescript
const output = new WorkerOutput();

// Set title
output.setTitle('Data Processor');

// Use groups to organize logs
output.openGroup('initialization');
output.log('INFO', 'Loading configuration');
output.log('INFO', 'Connecting to database');
output.closeGroup();

// Track progress
output.openGroup('processing');
const progress = output.startProgress('records', 1000, 'Processing records');

for (let i = 0; i < 1000; i++) {
  await processRecord(i);
  output.incrementProgress(1, 'records');

  if (i % 100 === 0) {
    output.log('DEBUG', `Processed ${i} records`);
  }
}

output.closeProgress('records');
output.closeGroup();

output.log('INFO', 'Processing complete');
```

## WorkerProgress

`WorkerProgress` represents a single progress indicator. It's created automatically when you call `startProgress()`.

### Properties

```typescript
class WorkerProgress {
  uid: string;          // Unique identifier
  total: number;        // Total number of items/steps
  current: number;      // Current progress value
  title: string;        // Display title
  groups: string[];     // Group hierarchy when created
  running: boolean;     // Whether still active
}
```

### Methods

```typescript
// Get completion ratio (0.0 to 1.0)
getRatio(): number;

// Increment progress
incrementProgress(inc: number = 1): void;

// Update progress
updateProgress(current: number): void;
```

### Direct Usage (Advanced)

While you typically use `WorkerOutput` methods, you can also manipulate progress objects directly:

```typescript
const progress = output.startProgress('task', 100, 'Working');

// Access progress object
console.log(progress.getRatio());  // 0.0

// Direct manipulation
progress.updateProgress(50);
console.log(progress.getRatio());  // 0.5

output.closeProgress('task');
console.log(progress.running);     // false
```

## WorkerLog

`WorkerLog` represents a single log entry. It's created automatically when you call `log()`.

### Properties

```typescript
class WorkerLog {
  level: WorkerLogLevel;  // ERROR, WARN, INFO, DEBUG, TRACE
  args: any[];            // Arguments passed to log()
}
```

### Log Level Enum

```typescript
enum WorkerLogLevelEnum {
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}

type WorkerLogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
```

The numeric values allow for level comparison:

```typescript
import { WorkerLogLevelEnum, LogFilter } from '@webda/workout';

// Check if a log should be displayed
const shouldDisplay = LogFilter(
  WorkerLogLevelEnum.DEBUG,  // Log's level
  WorkerLogLevelEnum.INFO    // Logger's threshold
);
// Returns false (DEBUG=4 > INFO=3, so it's filtered out)
```

## WorkerMessage

`WorkerMessage` is the event object emitted by `WorkerOutput`. It contains all context about what happened.

### Structure

```typescript
class WorkerMessage {
  type: WorkerMessageType;    // Message type
  timestamp: number;          // Unix timestamp (ms)
  groups: string[];           // Current group hierarchy
  progresses: Map<string, WorkerProgress>;  // All active progresses
  context?: WorkerLog | WorkerProgress | WorkerInput;  // Type-specific data
}
```

### Message Types

```typescript
type WorkerMessageType =
  | 'progress.start'    // Progress indicator started
  | 'progress.update'   // Progress updated
  | 'progress.stop'     // Progress completed
  | 'group.open'        // Group opened
  | 'group.close'       // Group closed
  | 'log'               // Log message
  | 'input.request'     // User input requested
  | 'input.received'    // User input received
  | 'input.timeout'     // Input request timed out
  | 'title.set';        // Title changed
```

### Listening to Messages

```typescript
const output = new WorkerOutput();

// Listen to all messages
output.on('message', (msg: WorkerMessage) => {
  console.log('Message type:', msg.type);
  console.log('Timestamp:', new Date(msg.timestamp));
  console.log('Groups:', msg.groups);
  console.log('Active progresses:', msg.progresses.size);

  if (msg.type === 'log') {
    const log = msg.context as WorkerLog;
    console.log('Log level:', log.level);
    console.log('Log args:', log.args);
  }

  if (msg.type === 'progress.update') {
    const progress = msg.context as WorkerProgress;
    console.log('Progress:', progress.current, '/', progress.total);
    console.log('Ratio:', progress.getRatio());
  }
});

output.log('INFO', 'Test message');
output.startProgress('task', 100, 'Working');
output.updateProgress(50, 'task');
```

## WorkerInput

`WorkerInput` represents a user input request.

### Properties

```typescript
class WorkerInput {
  uuid: string;               // Unique identifier
  title: string;              // Prompt message
  type: WorkerInputType;      // Input type
  validators: RegExp[];       // Validation patterns
  value?: string;             // User's input (after received)
}
```

### Input Types

```typescript
enum WorkerInputType {
  STRING = 'STRING',              // Regular text input
  PASSWORD = 'PASSWORD',          // Hidden input
  CONFIRMATION = 'CONFIRMATION',  // Yes/no confirmation
  LIST = 'LIST'                   // Select from list
}
```

### Validation

```typescript
class WorkerInput {
  // Validate input against all patterns
  validate(input: string): boolean {
    return this.validators.every(validator => validator.test(input));
  }
}

// Example
const input = new WorkerInput();
input.validators = [/^[a-z]+$/, /^.{3,}$/];  // Lowercase, 3+ chars

console.log(input.validate('abc'));   // true
console.log(input.validate('ab'));    // false (too short)
console.log(input.validate('ABC'));   // false (uppercase)
```

## Message Flow Example

Here's how messages flow through the system:

```typescript
import { WorkerOutput, ConsoleLogger } from '@webda/workout';

const output = new WorkerOutput();

// Custom message handler
output.on('message', (msg) => {
  console.log(`[${msg.type}] at ${new Date(msg.timestamp).toISOString()}`);
});

// Also attach a logger
new ConsoleLogger(output, 'INFO');

// These calls trigger message events:
output.log('INFO', 'Starting');
// → Emits: { type: 'log', context: WorkerLog, ... }

output.startProgress('task', 100, 'Working');
// → Emits: { type: 'progress.start', context: WorkerProgress, ... }

output.updateProgress(50, 'task');
// → Emits: { type: 'progress.update', context: WorkerProgress, ... }

output.closeProgress('task');
// → Emits: { type: 'progress.stop', context: WorkerProgress, ... }
```

## Bunyan Compatibility

`WorkerOutput` can be used as a Bunyan logger:

```typescript
import { WorkerOutput } from '@webda/workout';

const output = new WorkerOutput();
const bunyanLogger = output.getBunyanLogger();

// Use like a Bunyan logger
bunyanLogger.info('Information message');
bunyanLogger.warn('Warning message');
bunyanLogger.error('Error message');
bunyanLogger.debug('Debug message');
bunyanLogger.trace('Trace message');

// With fields
bunyanLogger.info({ user: 'john', action: 'login' }, 'User logged in');
```

The Bunyan logger automatically maps Bunyan levels to WorkerOutput levels:
- Bunyan `fatal` → WorkerOutput `ERROR`
- Bunyan `error` → WorkerOutput `ERROR`
- Bunyan `warn` → WorkerOutput `WARN`
- Bunyan `info` → WorkerOutput `INFO`
- Bunyan `debug` → WorkerOutput `DEBUG`
- Bunyan `trace` → WorkerOutput `TRACE`

## Best Practices

### 1. Use UIDs for Multiple Progresses

When tracking multiple operations, use descriptive UIDs:

```typescript
// Good
output.startProgress('download-images', 1000, 'Downloading images');
output.startProgress('download-videos', 500, 'Downloading videos');

// Bad - no UID differentiation
output.startProgress('download', 1000, 'Downloading');
output.startProgress('download', 500, 'Downloading');  // Overwrites!
```

### 2. Always Close Progress

Use try/finally to ensure progress indicators are closed:

```typescript
const progressUid = 'my-task';
output.startProgress(progressUid, 100, 'Working');

try {
  // Work here
  output.updateProgress(50, progressUid);
} finally {
  output.closeProgress(progressUid);
}
```

### 3. Match Groups

Always close groups you open:

```typescript
output.openGroup('task');
try {
  // Work here
} finally {
  output.closeGroup();
}
```

### 4. Use Appropriate Log Levels

Follow standard logging conventions:

```typescript
// ERROR - Something failed that requires attention
output.log('ERROR', 'Failed to connect to database:', error);

// WARN - Something unexpected but not critical
output.log('WARN', 'Configuration file not found, using defaults');

// INFO - Important business events
output.log('INFO', 'Server started on port 3000');
output.log('INFO', 'User logged in:', username);

// DEBUG - Detailed diagnostic information
output.log('DEBUG', 'Cache miss for key:', key);
output.log('DEBUG', 'Query took', duration, 'ms');

// TRACE - Very detailed diagnostic information
output.log('TRACE', 'Full request object:', request);
```

### 5. Leverage Groups for Context

Use groups to provide context without repeating information:

```typescript
// Without groups
output.log('INFO', '[Database] Connecting to database');
output.log('INFO', '[Database] Running migrations');
output.log('INFO', '[Database] Database ready');

// With groups (better)
output.openGroup('database');
output.log('INFO', 'Connecting to database');
output.log('INFO', 'Running migrations');
output.log('INFO', 'Database ready');
output.closeGroup();
```

### 6. Progress Ratio for Percentage Display

Use `getRatio()` to display percentages:

```typescript
const progress = output.startProgress('task', 1000, 'Processing');

// Update and display percentage
output.updateProgress(250, 'task');
const progressObj = output.progresses.get('task');
console.log(`Progress: ${(progressObj.getRatio() * 100).toFixed(1)}%`);
// Output: Progress: 25.0%
```

## Next Steps

- [Loggers](./loggers.md) - Learn about different logger implementations
- [Terminal UI](./terminal-ui.md) - Build rich terminal interfaces
- [API Reference](./api-reference.md) - Complete API documentation
- [Advanced Usage](./advanced-usage.md) - Advanced patterns and techniques
