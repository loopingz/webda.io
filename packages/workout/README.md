# @webda/workout module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

The goal of this library is to provide a common framework for logging and user interaction. You can run your code in the console, serve content to a webpage, or write to files, all while providing feedback and interaction with backend processes through a unified abstraction layer.

## Features

- **Multiple Logger Types**: Console, File, Memory, Interactive Console, and Terminal loggers
- **Progress Indicators**: Determinate and indeterminate progress tracking with visual feedback
- **User Input**: Request and validate user input with support for passwords and confirmations
- **Grouped Logging**: Organize logs with nested groups
- **Fork Support**: Run code in forked processes with automatic log forwarding
- **Bunyan Compatibility**: Drop-in replacement for Bunyan logger
- **Terminal UI**: Full-featured terminal interface with progress bars, spinners, and scrolling
- **Source Line Tracking**: Optionally track file, line, and function information for each log

## Installation

```bash
npm install @webda/workout
```

For interactive console features with user prompts, also install:
```bash
npm install @inquirer/prompts
```

## Quick Start

### Basic Logging

```typescript
import { WorkerOutput, ConsoleLogger } from "@webda/workout";

const output = new WorkerOutput();
new ConsoleLogger(output, "INFO");

output.log("INFO", "Application started");
output.log("WARN", "This is a warning");
output.log("ERROR", "An error occurred");
```

### Using the Global Helper

```typescript
import { useLog, useWorkerOutput } from "@webda/workout";

// Simple logging
useLog("INFO", "Hello", "World");
useLog("ERROR", "Something went wrong");

// With context
useWorkerOutput().addLogProducerLine = true;
useLog("DEBUG", "This will include file:line:function info");
```

### Progress Indicators

```typescript
import { useWorkerOutput, ConsoleLogger } from "@webda/workout";

const output = useWorkerOutput();
new ConsoleLogger(output);

// Determinate progress
output.startProgress("download", 100, "Downloading files...");
for (let i = 0; i <= 100; i++) {
  output.updateProgress(i, "download");
  await new Promise(resolve => setTimeout(resolve, 50));
}

// Indeterminate activity
output.startActivity("Processing data");
await someAsyncOperation();
output.stopActivity("success", "Processing complete");
```

### Interactive Console with Spinners

```typescript
import { useWorkerOutput, InteractiveConsoleLogger } from "@webda/workout";

const output = useWorkerOutput();
new InteractiveConsoleLogger(output);

output.startActivity("Building project");
await buildProject();
output.stopActivity("success", "Build complete");

// Request user input (requires @inquirer/prompts)
const name = await output.requestInput(
  "What is your name?",
  WorkerInputType.STRING,
  [/^[a-zA-Z]+$/]
);
output.log("INFO", `Hello, ${name}!`);
```

### Grouped Logging

```typescript
import { useWorkerOutput, ConsoleLogger } from "@webda/workout";

const output = useWorkerOutput();
new ConsoleLogger(output);

output.openGroup("Database");
output.log("INFO", "Connecting to database");
output.log("INFO", "Running migrations");

output.openGroup("Migrations");
output.log("INFO", "Applied migration 001");
output.log("INFO", "Applied migration 002");
output.closeGroup();

output.log("INFO", "Database ready");
output.closeGroup();
```

### Fork Support

Run code in a forked process with automatic log forwarding:

```typescript
import { Fork, useLog, useWorkerOutput } from "@webda/workout";

await Fork(
  async () => {
    // This code runs in the forked process
    useLog("INFO", "Hello from the forked process");
    useWorkerOutput().startActivity("Long task");
    await new Promise(resolve => setTimeout(resolve, 2000));
    useWorkerOutput().stopActivity("success", "Task complete");
  },
  () => {
    // This code runs in the parent process
    useLog("INFO", "Parent process monitoring child");
  }
);
```

### Bunyan Logger Compatibility

Drop-in replacement for Bunyan:

```typescript
import { useWorkerOutput, ConsoleLogger } from "@webda/workout";

const output = useWorkerOutput();
new ConsoleLogger(output);

const logger = output.getBunyanLogger();

logger.info("Application started");
logger.warn({ userId: 123 }, "User action");
logger.error(new Error("Something failed"), "Error processing request");
```

### File Logger

```typescript
import { useWorkerOutput, FileLogger } from "@webda/workout";

const output = useWorkerOutput();
new FileLogger(output, "INFO", "./app.log");

output.log("INFO", "This will be written to app.log");
```

### Terminal UI

Full-featured terminal interface with progress bars and logo:

```typescript
import { useWorkerOutput, Terminal } from "@webda/workout";

const output = useWorkerOutput();
const terminal = new Terminal(output, "INFO");

// Optional: Set a custom logo
terminal.setLogo([
  "╔══════════════╗",
  "║  My App v1.0 ║",
  "╚══════════════╝"
]);

output.startProgress("tasks", 10, "Processing tasks");
for (let i = 1; i <= 10; i++) {
  output.updateProgress(i, "tasks", `Task ${i} complete`);
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Clean up when done
terminal.close();
```

### Custom Log Format

```typescript
import { ConsoleLogger } from "@webda/workout";

const output = new WorkerOutput();
// Custom format: timestamp [level] message
new ConsoleLogger(output, "INFO", "%(d)s [%(l)s] %(m)s");

output.log("INFO", "Custom formatted log");
```

### Memory Logger (for Testing)

```typescript
import { useWorkerOutput, MemoryLogger } from "@webda/workout";

const output = useWorkerOutput();
const memoryLogger = new MemoryLogger(output);

output.log("INFO", "Test message");

// Access stored logs
console.log(memoryLogger.getLogs());
console.log(memoryLogger.getTree());
```

## Log Levels

Available log levels (from highest to lowest priority):
- `ERROR`
- `WARN`
- `INFO` (default)
- `DEBUG`
- `TRACE`

Set the log level via environment variable:
```bash
LOG_LEVEL=DEBUG node your-app.js
```

## API Documentation

### WorkerOutput

Main class for emitting logs and managing progress indicators.

**Key Methods:**
- `log(level, ...args)` - Log a message
- `startProgress(uid, total, title?)` - Start a determinate progress indicator
- `startActivity(title?, uid?)` - Start an indeterminate activity
- `updateProgress(current, uid?, title?)` - Update progress
- `stopActivity(status?, title?, uid?)` - Stop an activity with optional status
- `openGroup(name)` - Start a log group
- `closeGroup()` - Close the current log group
- `requestInput(title, type?, validators?, waitFor?, timeout?)` - Request user input
- `setInteractive(interactive)` - Enable/disable interactive mode
- `getBunyanLogger()` - Get a Bunyan-compatible logger interface

### Logger Classes

All loggers extend `WorkerLogger` and listen to `WorkerOutput` events:
- `ConsoleLogger` - Basic console output with colors
- `InteractiveConsoleLogger` - Console with spinners and progress bars
- `Terminal` - Full terminal UI with scrolling and advanced features
- `FileLogger` - Write logs to a file
- `MemoryLogger` - Store logs in memory (useful for testing)

## Custom logo for bash

Create your custom logo using:

https://github.com/jart/hiptext

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
