---
sidebar_position: 1
title: Overview
description: Introduction to @webda/workout - Abstraction for logging and user interaction
---

# @webda/workout

An abstraction layer for logging and user interaction that works seamlessly across different environments (terminal, web, backend processes).

## What is @webda/workout?

`@webda/workout` is a sophisticated logging and interaction framework that decouples your application logic from the presentation layer. It provides a unified interface for:

- **Structured Logging** - Five log levels (ERROR, WARN, INFO, DEBUG, TRACE) with filtering
- **Progress Tracking** - Multiple concurrent progress indicators with real-time updates
- **User Interaction** - Request and validate user input (strings, passwords, confirmations, lists)
- **Multi-output Support** - Route output simultaneously to console, files, memory, or custom handlers
- **Terminal UI** - Full-featured terminal interface with progress bars and scrollable history
- **Event-Based Architecture** - EventEmitter-based for flexible integration

## Key Features

### 🎯 Environment Agnostic
Write your code once and have it work in CLI tools, web applications, or backend processes without modification.

### 📊 Rich Progress Tracking
Display multiple concurrent progress indicators with automatic updates, ratios, and status tracking.

### 🎨 Beautiful Terminal UI
Full-featured terminal interface with:
- Animated progress bars using Braille Unicode characters
- Scrollable history (2000 lines)
- Interactive input prompts
- Custom ASCII art logos
- Automatic TTY detection with fallback

### 📝 Flexible Logging
- Multiple logger types (Console, File, Memory, Terminal, Debug)
- Sprintf-style format strings for custom output
- Log rotation for file loggers
- Bunyan compatibility

### 🔒 Input Validation
Request user input with built-in validation using regular expressions and configurable timeouts.

### 📦 Hierarchical Organization
Group related logs and progress indicators with nested hierarchies for better organization.

## Architecture

```
┌─────────────────┐
│  WorkerOutput   │  ← Your Application
│  (EventEmitter) │
└────────┬────────┘
         │ emits WorkerMessage events
         │
    ┌────┴────┬──────────┬──────────┬──────────┐
    │         │          │          │          │
┌───▼───┐ ┌──▼──┐ ┌─────▼─────┐ ┌──▼──┐ ┌────▼─────┐
│Console│ │File │ │  Terminal │ │Memory│ │  Custom  │
│Logger │ │Logger│ │    UI     │ │Logger│ │  Logger  │
└───────┘ └─────┘ └───────────┘ └──────┘ └──────────┘
```

## Use Cases

### CLI Applications
Build interactive command-line tools with progress indicators, colored output, and user prompts.

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

const output = new WorkerOutput();
const terminal = new Terminal(output);

output.log('INFO', 'Starting application...');
const progress = output.startProgress('task', 100, 'Processing items');
// Your processing logic here
output.closeProgress('task');
```

### Long-Running Processes
Track progress of background tasks with multiple concurrent operations.

```typescript
const download = output.startProgress('download', fileSize, 'Downloading');
const extract = output.startProgress('extract', fileCount, 'Extracting files');

// Update progress as operations complete
output.updateProgress(bytesDownloaded, 'download');
output.updateProgress(filesExtracted, 'extract');
```

### Application Logging
Centralized logging with multiple outputs (console during development, files in production).

```typescript
import { WorkerOutput, ConsoleLogger, FileLogger } from '@webda/workout';

const output = new WorkerOutput();
new ConsoleLogger(output, 'DEBUG');
new FileLogger(output, 'INFO', './logs/app.log');

output.log('INFO', 'Application started');
output.log('DEBUG', 'Debug information', { context: 'data' });
output.log('ERROR', 'An error occurred:', error);
```

### Testing and Debugging
Capture all output in memory for testing or debugging purposes.

```typescript
import { WorkerOutput, MemoryLogger } from '@webda/workout';

const output = new WorkerOutput();
const logger = new MemoryLogger(output, 'DEBUG', true);

// Run your code
myFunction(output);

// Retrieve and assert logs
const logs = logger.getLogs();
assert(logs.some(log => log.args[0] === 'Expected message'));
```

## Quick Example

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

// Create output and terminal UI
const output = new WorkerOutput();
const terminal = new Terminal(output);

// Set title
output.setTitle('My Application');

// Log messages
output.log('INFO', 'Application started');
output.log('WARN', 'This is a warning');

// Create progress indicator
const progress = output.startProgress('download', 1000, 'Downloading files');

// Simulate work
for (let i = 0; i <= 1000; i += 100) {
  await new Promise(resolve => setTimeout(resolve, 100));
  output.updateProgress(i, 'download');
}

output.closeProgress('download');
output.log('INFO', 'Download complete');

// Request user input
output.setInteractive(true);
const result = await output.requestInput(
  'Enter your name:',
  'STRING',
  /^[a-zA-Z\s]+$/,
  10000
);

output.log('INFO', `Hello, ${result}!`);

// Clean up
terminal.close();
```

## Package Information

- **Version:** 3.2.1
- **License:** Apache 2.0
- **Repository:** [github.com/loopingz/webda.io](https://github.com/loopingz/webda.io)
- **Node.js:** >=18.0.0
- **Module Type:** ES Module (ESM)
- **Author:** Remi Cattiau

## Installation

```bash
npm install @webda/workout
```

```bash
yarn add @webda/workout
```

```bash
pnpm add @webda/workout
```

## Next Steps

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Core Concepts](./core-concepts.md) - Understanding WorkerOutput, Progress, and Logs
- [Loggers](./loggers.md) - Different logger types and their use cases
- [Terminal UI](./terminal-ui.md) - Building interactive terminal applications
- [API Reference](./api-reference.md) - Complete API documentation
- [Comparison](./comparison.md) - How @webda/workout compares to other libraries
- [Advanced Usage](./advanced-usage.md) - Advanced patterns and techniques
