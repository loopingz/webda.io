---
sidebar_position: 5
title: Terminal UI
description: Building rich interactive terminal applications
---

# Terminal UI

The `Terminal` class provides a full-featured terminal user interface with animated progress bars, scrollable history, and interactive input.

## Overview

Terminal extends `WorkerLogger` to provide a rich, real-time terminal experience:

- Animated progress bars using Braille Unicode characters
- Scrollable command history (up to 2000 lines)
- Keyboard navigation (arrow keys, Page Up/Down)
- Interactive input prompts with validation
- Automatic TTY detection with fallback
- Custom logo support
- Terminal resize handling
- Color-coded log levels

## Basic Usage

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

const output = new WorkerOutput();
const terminal = new Terminal(output, 'INFO');

output.setTitle('My Application');
output.log('INFO', 'Starting...');

// Progress bar automatically rendered
const progress = output.startProgress('task', 100, 'Processing');
for (let i = 0; i <= 100; i += 10) {
  await new Promise(resolve => setTimeout(resolve, 100));
  output.updateProgress(i, 'task');
}
output.closeProgress('task');

terminal.close();
```

## Constructor

```typescript
constructor(
  output: WorkerOutput,
  level: WorkerLogLevel = 'INFO',
  format?: string
)
```

### Parameters

- **output** - WorkerOutput instance to listen to
- **level** - Minimum log level to display (default: 'INFO')
- **format** - Optional sprintf-style format string

## Features

### TTY Detection

Terminal automatically detects if running in a TTY environment:

```typescript
const terminal = new Terminal(output, 'INFO');

if (terminal.tty) {
  console.log('Running in TTY mode - full UI available');
} else {
  console.log('Not a TTY - using fallback ConsoleLogger');
}
```

When not in a TTY (e.g., piped output, CI/CD), Terminal automatically falls back to `ConsoleLogger` for simple text output.

### Animated Progress Bars

Terminal displays progress bars with animated spinners:

```typescript
output.startProgress('download', 1000, 'Downloading files');

// Progress bar updates automatically as you update progress
output.updateProgress(250, 'download');  // 25%
output.updateProgress(500, 'download');  // 50%
output.updateProgress(750, 'download');  // 75%

output.closeProgress('download');
```

**Progress Bar Format:**
```
⠋ Downloading files: 250/1000 (25.0%)
⠙ Downloading files: 500/1000 (50.0%)
⠹ Downloading files: 750/1000 (75.0%)
✓ Downloading files: Complete
```

The spinner animates through Braille Unicode characters:
```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
```

### Custom Animation Speed

Control the refresh rate:

```typescript
import { Terminal } from '@webda/workout';

// Default: 100ms
Terminal.refreshSpeed = 100;

// Faster animation (50ms)
Terminal.refreshSpeed = 50;

// Slower animation (200ms)
Terminal.refreshSpeed = 200;
```

### Multiple Progress Bars

Display multiple concurrent progress indicators:

```typescript
output.startProgress('download', 1000, 'Downloading');
output.startProgress('extract', 500, 'Extracting');
output.startProgress('compile', 200, 'Compiling');

// All three progress bars display simultaneously
// Each with its own animated spinner
```

**Output:**
```
⠋ Downloading: 250/1000 (25.0%)
⠙ Extracting: 100/500 (20.0%)
⠹ Compiling: 50/200 (25.0%)
```

### Scrollable History

Terminal maintains a scrollable history of up to 2000 lines:

**Keyboard Controls:**
- **Arrow Up** - Scroll up one line
- **Arrow Down** - Scroll down one line
- **Page Up** - Scroll up one page
- **Page Down** - Scroll down one page
- **Home** - Jump to top
- **End** - Jump to bottom

```typescript
const terminal = new Terminal(output, 'INFO');

// Log many messages
for (let i = 0; i < 1000; i++) {
  output.log('INFO', `Message ${i}`);
}

// User can scroll through history using keyboard
// Terminal automatically manages scrolling
```

### Title Bar

Set a title for your application:

```typescript
output.setTitle('Data Processing Tool v1.0');

// Title appears at the top of the terminal
// Visible throughout the session
```

**Display:**
```
═══════════════════════════════════════
  Data Processing Tool v1.0
═══════════════════════════════════════
```

### Custom Logo

Display a custom ASCII art logo:

```typescript
const logo = `
  ███╗   ███╗██╗   ██╗     █████╗ ██████╗ ██████╗
  ████╗ ████║╚██╗ ██╔╝    ██╔══██╗██╔══██╗██╔══██╗
  ██╔████╔██║ ╚████╔╝     ███████║██████╔╝██████╔╝
  ██║╚██╔╝██║  ╚██╔╝      ██╔══██║██╔═══╝ ██╔═══╝
  ██║ ╚═╝ ██║   ██║       ██║  ██║██║     ██║
  ╚═╝     ╚═╝   ╚═╝       ╚═╝  ╚═╝╚═╝     ╚═╝
`;

terminal.setLogo(logo);

// Logo displays at the top of the terminal
```

### Color-Coded Output

Log levels are automatically color-coded:

```typescript
output.log('ERROR', 'Critical error');   // Red
output.log('WARN', 'Warning message');   // Yellow
output.log('INFO', 'Information');       // Default
output.log('DEBUG', 'Debug info');       // Grey
output.log('TRACE', 'Trace details');    // Grey
```

### Interactive Input

Request user input with Terminal UI:

```typescript
const output = new WorkerOutput();
const terminal = new Terminal(output);

output.setInteractive(true);

// Prompt appears in footer with validation
const name = await output.requestInput(
  'Enter your name:',
  'STRING',
  /^[a-zA-Z\s]{2,}$/,
  30000
);

console.log(`Hello, ${name}!`);

terminal.close();
```

**Input Display:**
```
═══════════════════════════════════════
Enter your name: John Do█
                         ↑ cursor
═══════════════════════════════════════
```

Invalid input is rejected with visual feedback:
```
═══════════════════════════════════════
Enter your name: @#$
❌ Invalid input - please try again
═══════════════════════════════════════
```

### Password Input

Hidden input for sensitive data:

```typescript
const password = await output.requestInput(
  'Enter password:',
  'PASSWORD',
  /^.{8,}$/,  // At least 8 characters
  30000
);
```

**Display:**
```
═══════════════════════════════════════
Enter password: ********█
═══════════════════════════════════════
```

### Confirmation Prompts

Yes/no confirmation:

```typescript
const confirmed = await output.requestInput(
  'Delete all files? (yes/no)',
  'CONFIRMATION',
  undefined,
  30000
);

if (confirmed === 'yes') {
  output.log('INFO', 'Files deleted');
} else {
  output.log('INFO', 'Operation cancelled');
}
```

### Input Timeout

Handle input timeouts gracefully:

```typescript
try {
  const result = await output.requestInput(
    'Enter value:',
    'STRING',
    /^\d+$/,
    5000  // 5 second timeout
  );
  console.log('Received:', result);
} catch (error) {
  if (error.message.includes('timeout')) {
    output.log('WARN', 'Input timed out, using default');
  }
}
```

## Terminal Dimensions

Terminal automatically tracks terminal size:

```typescript
const terminal = new Terminal(output);

console.log(`Terminal size: ${terminal.width}x${terminal.height}`);

// Automatically updates on terminal resize
// Output adjusts to fit available space
```

### Resize Handling

Terminal handles resize events automatically:

```typescript
// User resizes terminal window
// Terminal detects change and redraws display
// Progress bars and text wrap to new width
// History adjusts to new height
```

## Complete Example

Here's a comprehensive example using all Terminal features:

```typescript
import { WorkerOutput, Terminal } from '@webda/workout';

async function main() {
  const output = new WorkerOutput();
  const terminal = new Terminal(output, 'INFO');

  // Set logo
  const logo = `
  ╔═══════════════════════════════╗
  ║   FILE PROCESSING TOOL        ║
  ║   Version 1.0                 ║
  ╚═══════════════════════════════╝
  `;
  terminal.setLogo(logo);

  // Set title
  output.setTitle('File Processor v1.0');

  try {
    output.log('INFO', 'Initializing application...');

    // Simulate initialization
    output.openGroup('initialization');
    output.log('INFO', 'Loading configuration');
    await new Promise(resolve => setTimeout(resolve, 500));
    output.log('INFO', 'Connecting to services');
    await new Promise(resolve => setTimeout(resolve, 500));
    output.closeGroup();

    // Multiple concurrent operations
    output.openGroup('processing');

    const download = output.startProgress('download', 1000, 'Downloading files');
    const validate = output.startProgress('validate', 500, 'Validating data');

    // Simulate work with progress updates
    for (let i = 0; i <= 1000; i += 50) {
      await new Promise(resolve => setTimeout(resolve, 50));
      output.updateProgress(i, 'download');

      if (i <= 500) {
        output.updateProgress(i, 'validate');
      } else if (output.progresses.has('validate')) {
        output.closeProgress('validate');
      }
    }

    output.closeProgress('download');
    output.log('INFO', 'All operations complete');
    output.closeGroup();

    // Request user input
    output.setInteractive(true);

    const saveResults = await output.requestInput(
      'Save results? (yes/no)',
      'CONFIRMATION',
      undefined,
      30000
    );

    if (saveResults === 'yes') {
      const filename = await output.requestInput(
        'Enter filename:',
        'STRING',
        /^[a-zA-Z0-9_-]+\.txt$/,
        30000
      );

      output.log('INFO', `Saving to ${filename}`);

      const saveProgress = output.startProgress('save', 100, 'Saving file');
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        output.updateProgress(i, 'save');
      }
      output.closeProgress('save');

      output.log('INFO', `File saved: ${filename}`);
    } else {
      output.log('WARN', 'Results not saved');
    }

  } catch (error) {
    output.log('ERROR', 'An error occurred:', error.message);
  } finally {
    output.log('INFO', 'Application shutting down');
    terminal.close();
  }
}

main();
```

## Advanced Features

### Raw Terminal Mode

Terminal uses raw mode for keyboard input:

```typescript
// Terminal automatically:
// - Enables raw mode on startup
// - Disables line buffering
// - Captures individual keystrokes
// - Restores normal mode on close

// Always close terminal to restore normal mode
terminal.close();
```

### Custom Message Handling

Extend Terminal for custom behavior:

```typescript
import { Terminal } from '@webda/workout';

class CustomTerminal extends Terminal {
  onMessage(msg: WorkerMessage): void {
    // Custom pre-processing
    if (msg.type === 'log') {
      const log = msg.context as WorkerLog;
      if (log.level === 'ERROR') {
        // Custom error handling
        this.playErrorSound();
      }
    }

    // Call parent implementation
    super.onMessage(msg);
  }

  private playErrorSound(): void {
    // Custom error notification
    process.stdout.write('\x07');  // Bell character
  }
}
```

### Format Strings

Use sprintf-style format strings:

```typescript
// Add timestamp to each line
const format = '[%s] %s';  // [timestamp] message
const terminal = new Terminal(output, 'INFO', format);

output.log('INFO', 'Started');
// Displays: [2026-01-28T10:30:45.123Z] Started
```

## Performance Considerations

### Refresh Rate

Balance between smooth animation and CPU usage:

```typescript
// Smooth but more CPU
Terminal.refreshSpeed = 50;  // 20 FPS

// Balanced (default)
Terminal.refreshSpeed = 100;  // 10 FPS

// Conservative
Terminal.refreshSpeed = 200;  // 5 FPS
```

### History Limit

Terminal keeps up to 2000 lines in history:

```typescript
// History is automatically managed
// Oldest lines dropped when limit reached
// Limit: 2000 lines (hardcoded)

// For less memory usage, consider FileLogger instead
new FileLogger(output, 'INFO', './app.log');
```

### Large Output

For very large output (millions of lines), consider:

```typescript
// Option 1: Use FileLogger instead
new FileLogger(output, 'INFO', './app.log');

// Option 2: Increase log level to reduce output
const terminal = new Terminal(output, 'WARN');  // Only warnings and errors

// Option 3: Use ConsoleLogger for non-interactive output
const logger = new ConsoleLogger(output, 'INFO');
```

## Best Practices

### 1. Always Close Terminal

```typescript
const terminal = new Terminal(output);

try {
  // Your code
} finally {
  terminal.close();  // Essential - restores terminal mode
}
```

### 2. Check TTY Before Interactive Features

```typescript
const terminal = new Terminal(output);

if (terminal.tty) {
  // Interactive features available
  output.setInteractive(true);
  const input = await output.requestInput('Name:', 'STRING');
} else {
  // Fallback for non-TTY
  console.log('Running in non-interactive mode');
}
```

### 3. Use Appropriate Log Levels

```typescript
// Terminal shows lots of detail - use INFO by default
const terminal = new Terminal(output, 'INFO');

// For quieter output
const terminal = new Terminal(output, 'WARN');

// For debugging
const terminal = new Terminal(output, 'DEBUG');
```

### 4. Limit Concurrent Progress Bars

```typescript
// Good: 2-3 progress bars
output.startProgress('task1', 100, 'Task 1');
output.startProgress('task2', 100, 'Task 2');
output.startProgress('task3', 100, 'Task 3');

// Bad: Too many progress bars clutter the display
// Consider grouping or sequencing instead
```

### 5. Use Groups for Organization

```typescript
output.openGroup('phase1');
output.log('INFO', 'Starting phase 1');
// Phase 1 work
output.closeGroup();

output.openGroup('phase2');
output.log('INFO', 'Starting phase 2');
// Phase 2 work
output.closeGroup();
```

## Troubleshooting

### Terminal Not Displaying Correctly

**Issue:** Progress bars or colors not showing

**Solution:** Check TTY mode
```typescript
const terminal = new Terminal(output);
if (!terminal.tty) {
  console.log('Not running in TTY - visual features disabled');
}
```

### Terminal Not Restoring After Crash

**Issue:** Terminal stays in raw mode after crash

**Solution:** Always use try/finally
```typescript
const terminal = new Terminal(output);
try {
  // Code that might crash
} finally {
  terminal.close();  // Ensures cleanup
}
```

### Input Not Working

**Issue:** `requestInput` not responding

**Solution:** Enable interactive mode
```typescript
output.setInteractive(true);  // Required for input
const result = await output.requestInput('Prompt:', 'STRING');
```

### Progress Bars Flickering

**Issue:** Progress updates too fast causing flicker

**Solution:** Adjust refresh rate or throttle updates
```typescript
// Option 1: Slower refresh
Terminal.refreshSpeed = 200;

// Option 2: Throttle updates
let lastUpdate = 0;
if (Date.now() - lastUpdate > 100) {
  output.updateProgress(current, 'task');
  lastUpdate = Date.now();
}
```

## Next Steps

- [API Reference](./api-reference.md) - Complete API documentation
- [Advanced Usage](./advanced-usage.md) - Advanced patterns
- [Loggers](./loggers.md) - Other logger types
