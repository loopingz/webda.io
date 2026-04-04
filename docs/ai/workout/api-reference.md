---
sidebar_position: 6
title: API Reference
description: Complete API documentation for @webda/workout
---

# API Reference

Complete API documentation for `@webda/workout`.

## WorkerOutput

Central class for managing output, progress, and user interaction.

### Constructor

```typescript
constructor()
```

Creates a new WorkerOutput instance.

**Example:**
```typescript
import { WorkerOutput } from '@webda/workout';
const output = new WorkerOutput();
```

### Properties

#### progresses
```typescript
progresses: Map<string, WorkerProgress>
```
Map of active progress indicators keyed by UID.

#### groups
```typescript
groups: string[]
```
Stack of currently open group names.

#### interactive
```typescript
interactive: boolean
```
Whether interactive input mode is enabled.

#### title
```typescript
title: string
```
Current application title.

### Methods

#### log()
```typescript
log(level: WorkerLogLevel, ...args: any[]): void
```

Log a message at the specified level.

**Parameters:**
- `level` - Log level: 'ERROR', 'WARN', 'INFO', 'DEBUG', or 'TRACE'
- `args` - Arguments to log (like console.log)

**Example:**
```typescript
output.log('INFO', 'User logged in:', username);
output.log('ERROR', 'Failed to connect:', error);
output.log('DEBUG', 'Config:', config);
```

#### startProgress()
```typescript
startProgress(uid: string, total: number, title?: string): WorkerProgress
```

Start a new progress indicator.

**Parameters:**
- `uid` - Unique identifier for this progress
- `total` - Total number of items/steps
- `title` - Optional display title

**Returns:** WorkerProgress instance

**Example:**
```typescript
const progress = output.startProgress('download', 1000, 'Downloading');
```

#### updateProgress()
```typescript
updateProgress(current: number, uid?: string, title?: string): void
```

Update progress to a specific value.

**Parameters:**
- `current` - Current progress value
- `uid` - Progress identifier (optional if only one progress)
- `title` - Optional new title

**Example:**
```typescript
output.updateProgress(500, 'download');
output.updateProgress(750, 'download', 'Almost done');
```

#### incrementProgress()
```typescript
incrementProgress(inc: number = 1, uid?: string, title?: string): void
```

Increment progress by a specific amount.

**Parameters:**
- `inc` - Amount to increment (default: 1)
- `uid` - Progress identifier (optional if only one progress)
- `title` - Optional new title

**Example:**
```typescript
output.incrementProgress(10, 'download');
output.incrementProgress(1);  // Increment by 1
```

#### closeProgress()
```typescript
closeProgress(uid?: string): void
```

Close and complete a progress indicator.

**Parameters:**
- `uid` - Progress identifier (optional if only one progress)

**Example:**
```typescript
output.closeProgress('download');
```

#### openGroup()
```typescript
openGroup(name: string): void
```

Open a new group for organizing logs.

**Parameters:**
- `name` - Group name

**Example:**
```typescript
output.openGroup('initialization');
output.log('INFO', 'Loading config');
output.closeGroup();
```

#### closeGroup()
```typescript
closeGroup(): void
```

Close the most recently opened group.

**Example:**
```typescript
output.openGroup('task');
// Grouped logs
output.closeGroup();
```

#### requestInput()
```typescript
requestInput(
  title: string,
  type: WorkerInputType,
  regexp?: RegExp,
  waitFor?: number,
  timeout?: number
): Promise<string>
```

Request input from the user.

**Parameters:**
- `title` - Prompt message
- `type` - Input type: 'STRING', 'PASSWORD', 'CONFIRMATION', or 'LIST'
- `regexp` - Optional validation pattern
- `waitFor` - Timeout in milliseconds
- `timeout` - Alternative timeout parameter

**Returns:** Promise that resolves with user input

**Throws:** Error on timeout or validation failure

**Example:**
```typescript
const name = await output.requestInput(
  'Enter name:',
  'STRING',
  /^[a-zA-Z\s]+$/,
  30000
);
```

#### setInteractive()
```typescript
setInteractive(interactive: boolean): void
```

Enable or disable interactive input mode.

**Parameters:**
- `interactive` - Whether to enable interactive mode

**Example:**
```typescript
output.setInteractive(true);
const result = await output.requestInput('Prompt:', 'STRING');
```

#### setTitle()
```typescript
setTitle(title: string): void
```

Set the application title.

**Parameters:**
- `title` - Application title

**Example:**
```typescript
output.setTitle('My Application v1.0');
```

#### getBunyanLogger()
```typescript
getBunyanLogger(): BunyanLogger
```

Get a Bunyan-compatible logger interface.

**Returns:** Bunyan logger object

**Example:**
```typescript
const logger = output.getBunyanLogger();
logger.info('Message');
logger.error({ err: error }, 'Error occurred');
```

### Events

WorkerOutput extends EventEmitter and emits 'message' events:

```typescript
output.on('message', (msg: WorkerMessage) => {
  // Handle message
});
```

## WorkerProgress

Represents a progress indicator.

### Properties

#### uid
```typescript
uid: string
```
Unique identifier for this progress.

#### total
```typescript
total: number
```
Total number of items/steps.

#### current
```typescript
current: number
```
Current progress value.

#### title
```typescript
title: string
```
Display title.

#### groups
```typescript
groups: string[]
```
Group hierarchy when created.

#### running
```typescript
running: boolean
```
Whether this progress is still active.

### Methods

#### getRatio()
```typescript
getRatio(): number
```

Get completion ratio (0.0 to 1.0).

**Returns:** Ratio of current/total

**Example:**
```typescript
const progress = output.startProgress('task', 100, 'Working');
output.updateProgress(25, 'task');
console.log(progress.getRatio());  // 0.25
```

#### incrementProgress()
```typescript
incrementProgress(inc: number = 1): void
```

Increment progress by amount.

**Parameters:**
- `inc` - Amount to increment (default: 1)

**Example:**
```typescript
progress.incrementProgress(10);
```

#### updateProgress()
```typescript
updateProgress(current: number): void
```

Update progress to specific value.

**Parameters:**
- `current` - New progress value

**Example:**
```typescript
progress.updateProgress(50);
```

## WorkerLog

Represents a log entry.

### Properties

#### level
```typescript
level: WorkerLogLevel
```
Log level: 'ERROR', 'WARN', 'INFO', 'DEBUG', or 'TRACE'.

#### args
```typescript
args: any[]
```
Arguments passed to log().

## WorkerMessage

Event message emitted by WorkerOutput.

### Properties

#### type
```typescript
type: WorkerMessageType
```
Message type: 'log', 'progress.start', 'progress.update', 'progress.stop', 'group.open', 'group.close', 'input.request', 'input.received', 'input.timeout', or 'title.set'.

#### timestamp
```typescript
timestamp: number
```
Unix timestamp in milliseconds.

#### groups
```typescript
groups: string[]
```
Current group hierarchy.

#### progresses
```typescript
progresses: Map<string, WorkerProgress>
```
All active progress indicators.

#### context
```typescript
context?: WorkerLog | WorkerProgress | WorkerInput
```
Type-specific context data.

## WorkerInput

Represents a user input request.

### Properties

#### uuid
```typescript
uuid: string
```
Unique identifier.

#### title
```typescript
title: string
```
Prompt message.

#### type
```typescript
type: WorkerInputType
```
Input type: 'STRING', 'PASSWORD', 'CONFIRMATION', or 'LIST'.

#### validators
```typescript
validators: RegExp[]
```
Validation patterns.

#### value
```typescript
value?: string
```
User's input value (set after received).

### Methods

#### validate()
```typescript
validate(input: string): boolean
```

Validate input against all patterns.

**Parameters:**
- `input` - Input string to validate

**Returns:** true if valid, false otherwise

**Example:**
```typescript
const input = new WorkerInput();
input.validators = [/^[a-z]+$/, /^.{3,}$/];
console.log(input.validate('abc'));   // true
console.log(input.validate('AB'));    // false
```

## WorkerLogger

Abstract base class for all loggers.

### Constructor

```typescript
constructor(output: WorkerOutput, level: WorkerLogLevel)
```

**Parameters:**
- `output` - WorkerOutput instance to listen to
- `level` - Minimum log level to process

### Properties

#### level
```typescript
level: WorkerLogLevel
```
Minimum log level threshold.

#### output
```typescript
output: WorkerOutput
```
Associated WorkerOutput instance.

### Methods

#### onMessage()
```typescript
abstract onMessage(msg: WorkerMessage): void
```

Process a message. Must be implemented by subclasses.

**Parameters:**
- `msg` - WorkerMessage to process

#### close()
```typescript
close(): void
```

Close the logger and cleanup resources.

**Example:**
```typescript
const logger = new ConsoleLogger(output, 'INFO');
// Use logger
logger.close();
```

## ConsoleLogger

Logger that outputs to console with colors.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  format?: string
)
```

**Parameters:**
- `output` - WorkerOutput instance
- `level` - Minimum log level (default: 'INFO')
- `format` - Optional sprintf-style format string

**Example:**
```typescript
new ConsoleLogger(output, 'DEBUG');
new ConsoleLogger(output, 'INFO', '[%s] %s');
```

### Static Methods

#### getColor()
```typescript
static getColor(level: WorkerLogLevel): ChalkFunction
```

Get chalk color function for log level.

**Parameters:**
- `level` - Log level

**Returns:** Chalk color function

#### format()
```typescript
static format(msg: WorkerMessage, format?: string): string
```

Format a message using format string.

**Parameters:**
- `msg` - WorkerMessage to format
- `format` - Optional format string

**Returns:** Formatted string

#### display()
```typescript
static display(msg: WorkerMessage, format?: string): void
```

Display a message to console.

**Parameters:**
- `msg` - WorkerMessage to display
- `format` - Optional format string

#### handleMessage()
```typescript
static handleMessage(
  msg: WorkerMessage,
  level: WorkerLogLevel,
  format?: string
): void
```

Handle a message with level filtering.

**Parameters:**
- `msg` - WorkerMessage to handle
- `level` - Logger's level threshold
- `format` - Optional format string

## FileLogger

Logger that writes to files with rotation.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  filepath: string,
  sizeLimit: number = 50 * 1024 * 1024,
  format?: string
)
```

**Parameters:**
- `output` - WorkerOutput instance
- `level` - Minimum log level (default: 'INFO')
- `filepath` - Path to log file
- `sizeLimit` - Max file size before rotation (default: 50MB)
- `format` - Optional format string

**Example:**
```typescript
new FileLogger(output, 'INFO', './logs/app.log');
new FileLogger(output, 'DEBUG', './debug.log', 10 * 1024 * 1024);
```

### Properties

#### filepath
```typescript
filepath: string
```
Path to log file.

#### sizeLimit
```typescript
sizeLimit: number
```
Maximum file size before rotation.

### Methods

#### filter()
```typescript
filter(msg: WorkerMessage): boolean
```

Determine if message should be logged.

**Parameters:**
- `msg` - WorkerMessage to check

**Returns:** true if should be logged

#### getLine()
```typescript
getLine(msg: WorkerMessage): string
```

Format message to single line.

**Parameters:**
- `msg` - WorkerMessage to format

**Returns:** Formatted line

#### rotateLogs()
```typescript
rotateLogs(filepath: string): void
```

Rotate log file.

**Parameters:**
- `filepath` - Path to file to rotate

## MemoryLogger

Logger that captures messages in memory.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  includeAll: boolean = false,
  limit: number = 2000
)
```

**Parameters:**
- `output` - WorkerOutput instance
- `level` - Minimum log level (default: 'INFO')
- `includeAll` - Include all message types (default: false)
- `limit` - Maximum messages to keep (default: 2000)

**Example:**
```typescript
new MemoryLogger(output, 'DEBUG', false, 1000);
new MemoryLogger(output, 'TRACE', true);  // Capture everything
```

### Properties

#### messages
```typescript
messages: WorkerMessage[]
```
Captured messages.

#### limit
```typescript
limit: number
```
Maximum messages to keep.

#### includeAll
```typescript
includeAll: boolean
```
Whether to include all message types.

### Methods

#### getMessages()
```typescript
getMessages(): WorkerMessage[]
```

Get all captured messages.

**Returns:** Array of WorkerMessage

**Example:**
```typescript
const logger = new MemoryLogger(output, 'INFO');
// Run code
const messages = logger.getMessages();
console.log(`Captured ${messages.length} messages`);
```

#### getLogs()
```typescript
getLogs(): WorkerLog[]
```

Get only log messages.

**Returns:** Array of WorkerLog

**Example:**
```typescript
const logs = logger.getLogs();
const errors = logs.filter(log => log.level === 'ERROR');
```

#### clear()
```typescript
clear(): void
```

Clear all captured messages.

**Example:**
```typescript
logger.clear();
console.log(logger.getMessages().length);  // 0
```

#### setLogLevel()
```typescript
setLogLevel(level: WorkerLogLevel): void
```

Update log level threshold.

**Parameters:**
- `level` - New log level

**Example:**
```typescript
logger.setLogLevel('DEBUG');
```

## DebugLogger

Logger that writes all messages to file at full verbosity.

### Constructor

```typescript
constructor(output: WorkerOutput, filepath: string)
```

**Parameters:**
- `output` - WorkerOutput instance
- `filepath` - Path to debug log file

**Example:**
```typescript
new DebugLogger(output, './logs/debug.log');
```

## Terminal

Rich terminal UI logger.

### Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  format?: string
)
```

**Parameters:**
- `output` - WorkerOutput instance
- `level` - Minimum log level (default: 'INFO')
- `format` - Optional format string

**Example:**
```typescript
const terminal = new Terminal(output, 'INFO');
```

### Properties

#### tty
```typescript
tty: boolean
```
Whether running in TTY mode.

#### height
```typescript
height: number
```
Terminal height in lines.

#### width
```typescript
width: number
```
Terminal width in columns.

#### history
```typescript
history: string[]
```
Command/output history (max 2000).

#### scrollY
```typescript
scrollY: number
```
Current scroll position.

### Static Properties

#### refreshSpeed
```typescript
static refreshSpeed: number
```
Display refresh rate in milliseconds (default: 100).

**Example:**
```typescript
Terminal.refreshSpeed = 50;  // Faster animation
```

### Methods

#### setLogo()
```typescript
setLogo(logo: string): void
```

Set custom ASCII art logo.

**Parameters:**
- `logo` - Logo string

**Example:**
```typescript
terminal.setLogo(`
  ╔══════════╗
  ║  MY APP  ║
  ╚══════════╝
`);
```

#### close()
```typescript
close(): void
```

Close terminal and restore normal mode.

**Example:**
```typescript
try {
  // Use terminal
} finally {
  terminal.close();
}
```

## Utility Functions

### LogFilter()
```typescript
function LogFilter(
  logLineLevel: WorkerLogLevelEnum,
  loggerLevel: WorkerLogLevelEnum
): boolean
```

Determine if a log should be displayed based on level.

**Parameters:**
- `logLineLevel` - Level of the log message
- `loggerLevel` - Logger's level threshold

**Returns:** true if log should be displayed

**Example:**
```typescript
import { LogFilter, WorkerLogLevelEnum } from '@webda/workout';

const shouldDisplay = LogFilter(
  WorkerLogLevelEnum.DEBUG,  // Log is DEBUG
  WorkerLogLevelEnum.INFO    // Logger shows INFO+
);
console.log(shouldDisplay);  // false (DEBUG < INFO)
```

## Type Definitions

### WorkerLogLevel
```typescript
type WorkerLogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE'
```

### WorkerLogLevelEnum
```typescript
enum WorkerLogLevelEnum {
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}
```

### WorkerInputType
```typescript
enum WorkerInputType {
  STRING = 'STRING',
  PASSWORD = 'PASSWORD',
  CONFIRMATION = 'CONFIRMATION',
  LIST = 'LIST'
}
```

### WorkerMessageType
```typescript
type WorkerMessageType =
  | 'progress.start'
  | 'progress.update'
  | 'progress.stop'
  | 'group.open'
  | 'group.close'
  | 'log'
  | 'input.request'
  | 'input.received'
  | 'input.timeout'
  | 'title.set'
```

## Constants

### Default Values

```typescript
// FileLogger default size limit
const DEFAULT_SIZE_LIMIT = 50 * 1024 * 1024;  // 50MB

// MemoryLogger default limit
const DEFAULT_MESSAGE_LIMIT = 2000;

// Terminal history limit
const TERMINAL_HISTORY_LIMIT = 2000;

// Terminal default refresh
const DEFAULT_REFRESH_SPEED = 100;  // ms
```

## Next Steps

- [Getting Started](./getting-started.md) - Basic usage examples
- [Core Concepts](./core-concepts.md) - Understanding the architecture
- [Advanced Usage](./advanced-usage.md) - Advanced patterns and techniques
