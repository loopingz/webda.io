---
sidebar_position: 2
title: Getting Started
description: Quick start guide for @webda/workout
---

# Getting Started

This guide will help you get started with `@webda/workout` in just a few minutes.

## Installation

Install the package using your preferred package manager:

```bash
npm install @webda/workout
```

```bash
yarn add @webda/workout
```

```bash
pnpm add @webda/workout
```

## Requirements

- **Node.js:** >=18.0.0
- **Module System:** ES Modules (ESM)

## Basic Usage

### Simple Logging

The simplest way to use `@webda/workout` is with the `ConsoleLogger`:

```typescript
import { WorkerOutput, ConsoleLogger } from '@webda/workout';

// Create the output manager
const output = new WorkerOutput();

// Attach a console logger (DEBUG level shows all logs)
new ConsoleLogger(output, 'DEBUG');

// Log messages at different levels
output.log('INFO', 'Application started');
output.log('DEBUG', 'Debug information');
output.log('WARN', 'This is a warning');
output.log('ERROR', 'An error occurred');
```

**Output:**
```
Application started
Debug information
This is a warning  (in yellow)
An error occurred  (in red)
```

### Log Levels

`@webda/workout` supports five log levels in order of severity:

1. **ERROR** - Critical errors that need attention
2. **WARN** - Warnings that should be reviewed
3. **INFO** - General informational messages
4. **DEBUG** - Detailed debugging information
5. **TRACE** - Very detailed trace information

When you set a log level on a logger, it will only show messages at that level or higher severity:

```typescript
// Only show INFO, WARN, and ERROR (no DEBUG or TRACE)
new ConsoleLogger(output, 'INFO');

output.log('DEBUG', 'This will not be shown');
output.log('INFO', 'This will be shown');
output.log('ERROR', 'This will be shown');
```

### Progress Tracking

Track the progress of long-running operations:

```typescript
import { WorkerOutput, ConsoleLogger } from '@webda/workout';

const output = new WorkerOutput();
new ConsoleLogger(output, 'INFO');

// Start a progress indicator
output.startProgress('myTask', 100, 'Processing items');

// Update progress as work completes
for (let i = 0; i <= 100; i += 10) {
  await new Promise(resolve => setTimeout(resolve, 100));
  output.updateProgress(i, 'myTask', `Processing item ${i}`);
}

// Close the progress indicator
output.closeProgress('myTask');
```

**Alternative Progress Methods:**

```typescript
// Increment progress by a specific amount
output.incrementProgress(10, 'myTask');  // Add 10 to current progress

// Update with a new title
output.updateProgress(50, 'myTask', 'Halfway there!');
```

### Multiple Concurrent Progress Indicators

Track multiple operations simultaneously:

```typescript
const output = new WorkerOutput();
new ConsoleLogger(output, 'INFO');

// Start multiple progress indicators
output.startProgress('download', 1000, 'Downloading files');
output.startProgress('extract', 500, 'Extracting files');
output.startProgress('install', 250, 'Installing packages');

// Update them independently
output.updateProgress(250, 'download');
output.updateProgress(100, 'extract');
output.updateProgress(50, 'install');

// Close them as they complete
output.closeProgress('download');
output.closeProgress('extract');
output.closeProgress('install');
```

### Terminal UI

For a richer terminal experience with animated progress bars:

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

// Create output and attach terminal UI
const output = new WorkerOutput();
const terminal = new Terminal(output, 'INFO');

output.setTitle('My Application');
output.log('INFO', 'Starting process...');

// Progress bars are automatically rendered in the terminal
const progress = output.startProgress('task', 1000, 'Working');

for (let i = 0; i <= 1000; i += 50) {
  await new Promise(resolve => setTimeout(resolve, 50));
  output.updateProgress(i, 'task');
}

output.closeProgress('task');
output.log('INFO', 'Complete!');

// Clean up terminal when done
terminal.close();
```

The Terminal UI provides:
- Animated progress bars with Braille Unicode spinners
- Scrollable history (use Page Up/Down or arrow keys)
- Color-coded log levels
- Automatic TTY detection (falls back to ConsoleLogger if not in TTY)

### User Input

Request input from users with validation:

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

const output = new WorkerOutput();
const terminal = new Terminal(output);

// Enable interactive mode
output.setInteractive(true);

// Request a string input with validation
const name = await output.requestInput(
  'Enter your name:',
  'STRING',
  /^[a-zA-Z\s]{2,}$/,  // At least 2 characters, letters and spaces only
  30000  // 30 second timeout
);

output.log('INFO', `Hello, ${name}!`);

// Request password (hidden input)
const password = await output.requestInput(
  'Enter password:',
  'PASSWORD',
  /^.{8,}$/,  // At least 8 characters
  30000
);

// Request confirmation (yes/no)
const confirmed = await output.requestInput(
  'Are you sure? (yes/no)',
  'CONFIRMATION',
  undefined,
  30000
);

if (confirmed === 'yes') {
  output.log('INFO', 'Confirmed!');
}

terminal.close();
```

**Input Types:**
- `STRING` - Regular text input
- `PASSWORD` - Hidden input (for passwords)
- `CONFIRMATION` - Yes/no confirmation
- `LIST` - Select from a list (implementation-dependent)

### Organizing with Groups

Group related logs for better organization:

```typescript
const output = new WorkerOutput();
new ConsoleLogger(output, 'INFO');

output.log('INFO', 'Starting application');

output.openGroup('initialization');
output.log('INFO', 'Loading configuration');
output.log('INFO', 'Connecting to database');
output.log('INFO', 'Starting server');
output.closeGroup();

output.openGroup('processing');
output.log('INFO', 'Processing records');
  output.openGroup('validation');
  output.log('DEBUG', 'Validating record 1');
  output.log('DEBUG', 'Validating record 2');
  output.closeGroup();
output.closeGroup();

output.log('INFO', 'Application ready');
```

Groups create a hierarchy that can be used by loggers to format output differently or filter messages.

### Multiple Loggers

Send output to multiple destinations simultaneously:

```typescript
import {
  WorkerOutput,
  ConsoleLogger,
  FileLogger,
  MemoryLogger
} from '@webda/workout';

const output = new WorkerOutput();

// Log DEBUG and above to console
new ConsoleLogger(output, 'DEBUG');

// Log INFO and above to file
new FileLogger(output, 'INFO', './logs/app.log');

// Capture all logs in memory for testing
const memLogger = new MemoryLogger(output, 'TRACE', true);

output.log('TRACE', 'Trace message');  // Only to memory
output.log('DEBUG', 'Debug message');  // To console and memory
output.log('INFO', 'Info message');    // To all three
output.log('ERROR', 'Error message');  // To all three

// Later, retrieve logs from memory
const logs = memLogger.getLogs();
console.log(`Captured ${logs.length} log messages`);
```

## Complete Example

Here's a complete example that combines multiple features:

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

async function main() {
  // Setup
  const output = new WorkerOutput();
  const terminal = new Terminal(output, 'INFO');

  try {
    output.setTitle('File Processor');
    output.log('INFO', 'Starting file processor...');

    // Simulate file download
    output.openGroup('download');
    const downloadProgress = output.startProgress(
      'download',
      1000,
      'Downloading files'
    );

    for (let i = 0; i <= 1000; i += 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      output.updateProgress(i, 'download');
    }

    output.closeProgress('download');
    output.log('INFO', 'Download complete');
    output.closeGroup();

    // Simulate file processing
    output.openGroup('processing');
    const processProgress = output.startProgress(
      'process',
      500,
      'Processing files'
    );

    for (let i = 0; i <= 500; i += 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      output.updateProgress(i, 'process', `Processing file ${i}/500`);
    }

    output.closeProgress('process');
    output.log('INFO', 'Processing complete');
    output.closeGroup();

    // Request user confirmation
    output.setInteractive(true);
    const confirmed = await output.requestInput(
      'Save results? (yes/no)',
      'CONFIRMATION',
      undefined,
      30000
    );

    if (confirmed === 'yes') {
      output.log('INFO', 'Results saved successfully');
    } else {
      output.log('WARN', 'Results not saved');
    }

  } catch (error) {
    output.log('ERROR', 'An error occurred:', error.message);
  } finally {
    terminal.close();
  }
}

main();
```

## Next Steps

Now that you understand the basics, explore more advanced topics:

- [Core Concepts](./core-concepts.md) - Deep dive into WorkerOutput, Progress, and Messages
- [Loggers](./loggers.md) - Learn about different logger types and their configuration
- [Terminal UI](./terminal-ui.md) - Advanced terminal UI features and customization
- [Advanced Usage](./advanced-usage.md) - Patterns for complex applications

## Common Patterns

### Cleanup Pattern

Always close your terminal or loggers when done:

```typescript
const output = new WorkerOutput();
const terminal = new Terminal(output);

try {
  // Your code here
} finally {
  terminal.close();
}
```

### Progress Wrapper Pattern

Create a utility to automatically track function progress:

```typescript
async function withProgress<T>(
  output: WorkerOutput,
  uid: string,
  total: number,
  title: string,
  fn: (update: (current: number) => void) => Promise<T>
): Promise<T> {
  output.startProgress(uid, total, title);
  try {
    return await fn((current) => output.updateProgress(current, uid));
  } finally {
    output.closeProgress(uid);
  }
}

// Usage
await withProgress(output, 'task', 100, 'Processing', async (update) => {
  for (let i = 0; i <= 100; i++) {
    await doWork(i);
    update(i);
  }
});
```

### Scoped Logger Pattern

Create context-specific loggers:

```typescript
class ScopedLogger {
  constructor(
    private output: WorkerOutput,
    private scope: string
  ) {}

  log(level: string, ...args: any[]) {
    this.output.log(level, `[${this.scope}]`, ...args);
  }
}

const dbLogger = new ScopedLogger(output, 'DB');
const apiLogger = new ScopedLogger(output, 'API');

dbLogger.log('INFO', 'Connected to database');
apiLogger.log('INFO', 'API server started');
```
