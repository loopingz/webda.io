---
sidebar_position: 7
title: API Reference
description: Complete API reference for @webda/utils
---

# API Reference

Complete reference documentation for all classes, functions, and types exported by @webda/utils.

## Case Transformation

### TransformCase

Convert strings between different naming conventions.

```typescript
function TransformCase(
  name: string,
  newCase: TransformCaseType
): string
```

**Parameters:**
- `name`: String to transform
- `newCase`: Target case format

**Returns:** Transformed string

**Supported Cases:**
- `"none"` - No transformation
- `"camelCase"` - camelCase
- `"PascalCase"` - PascalCase
- `"snake_case"` - snake_case
- `"kebab-case"` - kebab-case
- `"ENV_VAR"` - SCREAMING_SNAKE_CASE
- `"UPPERCASE"` - UPPERCASE
- `"lowercase"` - lowercase

**Example:**
```typescript
TransformCase("UserProfile", "snake_case");  // "user_profile"
TransformCase("user-name", "camelCase");     // "userName"
TransformCase("apiKey", "ENV_VAR");          // "API_KEY"
```

## Duration

### Duration Class

Parse and manipulate duration strings.

```typescript
class Duration {
  constructor(duration: string | number);

  toSeconds(): number;
  toMs(): number;
  expired(start: number): boolean;
  valueOf(): number;
}
```

**Constructor:**
- `duration`: Duration string (e.g., "30s", "5m", "2h") or number of seconds

**Methods:**

#### toSeconds()

Convert duration to seconds.

```typescript
toSeconds(): number
```

**Returns:** Duration in seconds

**Example:**
```typescript
new Duration("2h").toSeconds();  // 7200
new Duration("1d").toSeconds();  // 86400
```

#### toMs()

Convert duration to milliseconds.

```typescript
toMs(): number
```

**Returns:** Duration in milliseconds

**Example:**
```typescript
new Duration("30s").toMs();  // 30000
new Duration("5m").toMs();   // 300000
```

#### expired()

Check if duration has elapsed since a start time.

```typescript
expired(start: number): boolean
```

**Parameters:**
- `start`: Start timestamp (from `Date.now()`)

**Returns:** `true` if duration has elapsed, `false` otherwise

**Example:**
```typescript
const timeout = new Duration("10s");
const start = Date.now();
// ... do work ...
if (timeout.expired(start)) {
  throw new Error("Timeout");
}
```

#### valueOf()

Get duration in milliseconds (for numeric coercion).

```typescript
valueOf(): number
```

**Returns:** Duration in milliseconds

**Supported Units:**
- Seconds: `s`, `sec`, `second`, `seconds`
- Minutes: `m`, `min`, `minute`, `minutes`
- Hours: `h`, `hr`, `hour`, `hours`
- Days: `d`, `day`, `days`
- Months: `mo`, `month`, `months` (30 days)
- Years: `y`, `yr`, `year`, `years` (365 days)

## FileSize

### FileSize Class

Parse and format file sizes.

```typescript
class FileSize {
  constructor(size: string | number);

  valueOf(): number;
  toString(): string;
  [Symbol.toPrimitive](hint: string): number | string;
}
```

**Constructor:**
- `size`: Size string (e.g., "1 MB", "1.5GB") or number of bytes

**Methods:**

#### valueOf()

Get size in bytes.

```typescript
valueOf(): number
```

**Returns:** Size in bytes

**Example:**
```typescript
new FileSize("1 MB").valueOf();    // 1048576
new FileSize("1.5 GB").valueOf();  // 1610612736
```

#### toString()

Format size as human-readable string.

```typescript
toString(): string
```

**Returns:** Formatted string (e.g., "1.50 MB")

**Example:**
```typescript
new FileSize(1048576).toString();  // "1.00 MB"
new FileSize(1536).toString();     // "1.50 KB"
```

**Supported Units:**
- Bytes: `B`, `O`
- Kilobytes: `KB`, `KO` (1024 bytes)
- Megabytes: `MB`, `MO`
- Gigabytes: `GB`, `GO`
- Terabytes: `TB`, `TO`
- Petabytes: `PB`, `PO`

## Async Utilities

### Throttler Class

Control concurrent promise execution.

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

**Constructor:**
- `concurrency`: Maximum concurrent operations (default: 1)
- `failFast`: Stop on first error (default: false)

**Methods:**

#### queue()

Queue an operation for execution.

```typescript
queue<T>(method: () => Promise<T>, name?: string): Promise<T>
```

**Parameters:**
- `method`: Async function to execute
- `name`: Optional name for tracking

**Returns:** Promise that resolves with method result

**Example:**
```typescript
const throttler = new Throttler(5);
for (let i = 0; i < 100; i++) {
  throttler.queue(async () => await processItem(i));
}
```

#### execute()

Alias for `queue()`.

#### wait()

Wait for all queued operations to complete.

```typescript
wait(): Promise<void>
```

**Returns:** Promise that resolves when all operations complete

**Example:**
```typescript
await throttler.queue(async () => task1());
await throttler.queue(async () => task2());
await throttler.wait();
console.log("All tasks complete");
```

#### setConcurrency()

Change maximum concurrent operations.

```typescript
setConcurrency(concurrency: number): void
```

**Parameters:**
- `concurrency`: New maximum concurrent operations

**Example:**
```typescript
throttler.setConcurrency(20);  // Increase to 20 concurrent
```

#### getInProgress()

Get currently executing operations.

```typescript
getInProgress(): Array<{ name?: string; promise: Promise<any> }>
```

**Returns:** Array of in-progress operations

**Example:**
```typescript
const running = throttler.getInProgress();
console.log(`Running: ${running.length} operations`);
running.forEach(op => console.log(op.name));
```

#### Throttler.run() (static)

Run multiple operations with throttling.

```typescript
static run<T>(
  methods: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]>
```

**Parameters:**
- `methods`: Array of async functions
- `concurrency`: Maximum concurrent operations

**Returns:** Promise resolving to array of results

**Example:**
```typescript
const operations = urls.map(url => async () => fetch(url));
const results = await Throttler.run(operations, 10);
```

### WaitFor

Retry an operation with configurable delay strategy.

```typescript
function WaitFor<T>(
  callback: (resolve: (value: T) => void, reject: (error: any) => void) => Promise<void> | void,
  retries: number,
  description?: string,
  delayer?: WaitDelayer
): Promise<T>
```

**Parameters:**
- `callback`: Function to retry (can return boolean or use resolve/reject)
- `retries`: Maximum retry attempts
- `description`: Optional description for logging
- `delayer`: Delay strategy between retries

**Returns:** Promise resolving with callback result

**Example:**
```typescript
await WaitFor(
  async () => {
    const result = await checkCondition();
    return result;  // true to complete, false to retry
  },
  10,
  "Waiting for condition",
  new WaitExponentialDelay(100, 2, 5000)
);
```

### sleep

Delay execution for specified milliseconds.

```typescript
function sleep(ms: number): Promise<void>
```

**Parameters:**
- `ms`: Milliseconds to sleep

**Returns:** Promise that resolves after delay

**Example:**
```typescript
await sleep(1000);  // Wait 1 second
console.log("1 second later");
```

### nextTick

Wait for next event loop tick(s).

```typescript
function nextTick(count: number = 1): Promise<void>
```

**Parameters:**
- `count`: Number of ticks to wait (default: 1)

**Returns:** Promise that resolves after tick(s)

**Example:**
```typescript
await nextTick();    // Wait 1 tick
await nextTick(5);   // Wait 5 ticks
```

### WaitLinearDelay

Constant delay between retries.

```typescript
class WaitLinearDelay extends WaitDelayer {
  constructor(delay: number);

  wait(): Promise<void>;
}
```

**Constructor:**
- `delay`: Milliseconds to wait between retries

**Example:**
```typescript
new WaitLinearDelay(1000);  // 1 second between retries
```

### WaitExponentialDelay

Exponential backoff delay strategy.

```typescript
class WaitExponentialDelay extends WaitDelayer {
  constructor(
    initialDelay: number,
    multiplier: number = 2,
    maxDelay: number = 30000
  );

  wait(): Promise<void>;
}
```

**Constructor:**
- `initialDelay`: Starting delay in milliseconds
- `multiplier`: Multiplier for each retry (default: 2)
- `maxDelay`: Maximum delay cap (default: 30000ms)

**Example:**
```typescript
// Start at 100ms, double each time, cap at 5s
new WaitExponentialDelay(100, 2, 5000);

// Timeline: 0ms, 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 5000ms, 5000ms...
```

### CancelablePromise

Promise that can be cancelled.

```typescript
class CancelablePromise<T> extends Promise<T> {
  constructor(
    executor: (
      resolve: (value: T) => void,
      reject: (reason?: any) => void
    ) => void
  );

  cancel(): void;
}
```

**Methods:**

#### cancel()

Cancel the promise.

```typescript
cancel(): void
```

**Example:**
```typescript
const promise = new CancelablePromise(async (resolve) => {
  const result = await longOperation();
  resolve(result);
});

// Cancel after 5 seconds
setTimeout(() => promise.cancel(), 5000);

try {
  await promise;
} catch (error) {
  console.log(error.message);  // "Promise cancelled"
}
```

### CancelableLoopPromise

Cancellable loop that executes repeatedly.

```typescript
class CancelableLoopPromise extends CancelablePromise<void> {
  constructor(
    callback: () => Promise<void>,
    interval: number
  );

  start(): void;
  cancel(): void;
}
```

**Constructor:**
- `callback`: Function to execute repeatedly
- `interval`: Milliseconds between executions

**Methods:**

#### start()

Start the loop.

```typescript
start(): void
```

#### cancel()

Stop the loop.

```typescript
cancel(): void
```

**Example:**
```typescript
const loop = new CancelableLoopPromise(
  async () => {
    await checkStatus();
  },
  1000  // Every second
);

loop.start();

// Stop after 10 seconds
setTimeout(() => loop.cancel(), 10000);
```

## File Operations

### FileUtils

Comprehensive file operation utilities.

```typescript
interface FileUtils {
  // File I/O
  load(filename: string, format?: Format): any;
  save(object: any, filename: string, format?: Format): void;

  // Configuration
  loadConfigurationFile(filename: string, allowImports?: boolean): any;
  getConfigurationFile(filename: string): string;

  // Directory operations
  walk(path: string, processor: (filepath: string) => void, options?: WalkerOptionsType): Promise<void>;
  walkSync(path: string, processor: (filepath: string) => void, options?: WalkerOptionsType): void;
  find(path: string, options?: FinderOptionsType): Promise<string[]>;

  // Streams
  getReadStream(path: string): Promise<Readable>;
  getWriteStream(path: string): Promise<Writable>;

  // Utilities
  clean(...files: string[]): void;
}

type Format = "json" | "yaml";

type WalkerOptionsType = {
  followSymlinks?: boolean;
  resolveSymlink?: boolean;
  includeDir?: boolean;
  skipHidden?: boolean;
  maxDepth?: number;
};

type FinderOptionsType = WalkerOptionsType & {
  filterPattern?: RegExp;
};
```

**Methods:**

#### load()

Load file with automatic format detection.

```typescript
load(filename: string, format?: Format): any
```

**Parameters:**
- `filename`: Path to file
- `format`: Optional format override

**Returns:** Parsed file contents

**Throws:** Error if file doesn't exist

**Example:**
```typescript
const data = FileUtils.load("config.json");
const yaml = FileUtils.load("config.yaml");
const compressed = FileUtils.load("data.json.gz");
```

#### save()

Save object to file with automatic formatting.

```typescript
save(object: any, filename: string, format?: Format): void
```

**Parameters:**
- `object`: Object to serialize
- `filename`: Path to file
- `format`: Optional format override

**Example:**
```typescript
FileUtils.save({ name: "test" }, "output.json");
FileUtils.save(data, "config.yaml");
FileUtils.save(largeData, "data.json.gz");
```

#### loadConfigurationFile()

Load configuration file without extension.

```typescript
loadConfigurationFile(filename: string, allowImports?: boolean): any
```

**Parameters:**
- `filename`: Base filename without extension
- `allowImports`: Process $import directives (default: true)

**Returns:** Parsed configuration

**Throws:** Error if no matching file found

**Example:**
```typescript
// Tries: config.yaml, config.yml, config.jsonc, config.json
const config = FileUtils.loadConfigurationFile("config");
```

#### getConfigurationFile()

Get path to configuration file.

```typescript
getConfigurationFile(filename: string): string
```

**Parameters:**
- `filename`: Base filename without extension

**Returns:** Full path to existing configuration file

**Throws:** Error if no matching file found

#### walk()

Recursively walk directory tree.

```typescript
walk(
  path: string,
  processor: (filepath: string) => void,
  options?: WalkerOptionsType
): Promise<void>
```

**Parameters:**
- `path`: Directory to walk
- `processor`: Function called for each file
- `options`: Walk options

**Returns:** Promise that resolves when walk completes

**Example:**
```typescript
await FileUtils.walk("./src", (filepath) => {
  console.log(filepath);
}, {
  skipHidden: true,
  maxDepth: 5
});
```

#### walkSync()

Synchronous directory walk.

```typescript
walkSync(
  path: string,
  processor: (filepath: string) => void,
  options?: WalkerOptionsType
): void
```

#### find()

Find files matching criteria.

```typescript
find(path: string, options?: FinderOptionsType): Promise<string[]>
```

**Parameters:**
- `path`: Directory to search
- `options`: Finder options including `filterPattern`

**Returns:** Promise resolving to array of file paths

**Example:**
```typescript
const tsFiles = await FileUtils.find("./src", {
  filterPattern: /\.ts$/,
  maxDepth: 3
});
```

#### clean()

Delete files if they exist.

```typescript
clean(...files: string[]): void
```

**Parameters:**
- `files`: File paths to delete

**Example:**
```typescript
FileUtils.clean("temp.json", "cache.json", "old.log");
```

### JSONUtils

JSON manipulation utilities.

```typescript
interface JSONUtils {
  // Stringify
  stringify(
    value: any,
    replacer?: (key: string, value: any) => any,
    space?: number | string,
    publicAudience?: boolean
  ): string;

  safeStringify(
    value: any,
    replacer?: (key: string, value: any) => any,
    space?: number | string
  ): string;

  // Parse
  parse(value: string): any;

  // Utilities
  duplicate(value: any): any;
  sortObject(unordered: any, transformer?: (obj: any) => any): any;

  // File operations
  loadFile(filename: string): any;
  saveFile(object: any, filename: string): void;
}
```

**Methods:**

#### stringify()

Enhanced JSON stringify with circular reference fallback.

```typescript
stringify(
  value: any,
  replacer?: (key: string, value: any) => any,
  space?: number | string,
  publicAudience?: boolean
): string
```

**Parameters:**
- `value`: Object to stringify
- `replacer`: Custom replacer function
- `space`: Indentation (default: 2)
- `publicAudience`: Filter private fields (`__*`) (default: false)

**Returns:** JSON string

#### safeStringify()

Stringify with circular reference handling.

```typescript
safeStringify(
  value: any,
  replacer?: (key: string, value: any) => any,
  space?: number | string
): string
```

#### parse()

Parse JSON with comments support (JSONC).

```typescript
parse(value: string): any
```

**Parameters:**
- `value`: JSON string (with or without comments)

**Returns:** Parsed object

#### duplicate()

Deep clone an object.

```typescript
duplicate(value: any): any
```

**Parameters:**
- `value`: Object to clone

**Returns:** Deep copy of object

#### sortObject()

Sort object keys alphabetically.

```typescript
sortObject(
  unordered: any,
  transformer?: (obj: any) => any
): any
```

**Parameters:**
- `unordered`: Object to sort
- `transformer`: Optional transformer for values

**Returns:** Object with sorted keys

### YAMLUtils

YAML manipulation utilities.

```typescript
interface YAMLUtils {
  // Parse
  parse(value: string): any | any[];

  // Stringify
  stringify(value: any, options?: any): string;

  // Utilities
  duplicate(value: any): any;

  // File operations
  loadFile(filename: string): any;
  saveFile(object: any, filename: string): void;
}
```

**Methods:**

#### parse()

Parse single or multiple YAML documents.

```typescript
parse(value: string): any | any[]
```

**Parameters:**
- `value`: YAML string

**Returns:** Parsed object (or array of objects for multiple documents)

#### stringify()

Convert object to YAML.

```typescript
stringify(value: any, options?: any): string
```

**Parameters:**
- `value`: Object to serialize
- `options`: YAML stringify options

**Returns:** YAML string

### YAMLProxy

Preserve YAML comments and formatting.

```typescript
class YAMLProxy {
  static parse(data: string): any;
  static stringify(obj: any): string;
}
```

**Methods:**

#### parse() (static)

Parse YAML with comment preservation.

```typescript
static parse(data: string): any
```

**Parameters:**
- `data`: YAML string

**Returns:** Proxied object that preserves structure

**Example:**
```typescript
const config = YAMLProxy.parse(yamlString);
config.database.host = "new-host";  // Comments preserved
```

#### stringify() (static)

Convert proxied object back to YAML.

```typescript
static stringify(obj: any): string
```

**Parameters:**
- `obj`: Proxied object or array

**Returns:** YAML string with preserved comments

### JSONCParser

Parse and manipulate JSON with comments.

```typescript
class JSONCParser {
  static parse(jsoncString: string): any;
  static stringify(
    tree: any,
    replacer?: (key: string, value: any) => any,
    space?: string | number
  ): string;
}
```

**Methods:**

#### parse() (static)

Parse JSONC (JSON with comments).

```typescript
static parse(jsoncString: string): any
```

**Parameters:**
- `jsoncString`: JSONC string

**Returns:** Proxied object that preserves comments

#### stringify() (static)

Convert proxied object back to JSONC.

```typescript
static stringify(
  tree: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number
): string
```

**Parameters:**
- `tree`: Proxied object or regular object
- `replacer`: Optional replacer function
- `space`: Indentation

**Returns:** JSONC string with preserved comments

## Stream Utilities

### NDJSONStream

Readable stream of newline-delimited JSON.

```typescript
class NDJSONStream extends Readable {
  constructor(data: any[]);
}
```

**Constructor:**
- `data`: Array of objects to stream

**Example:**
```typescript
const stream = new NDJSONStream([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" }
]);

stream.pipe(process.stdout);
```

### NDJSonReader

Parse newline-delimited JSON from stream.

```typescript
class NDJSonReader extends Writable {
  // Emits 'data' events with parsed objects
}
```

**Events:**
- `data`: Emitted for each parsed JSON object

**Example:**
```typescript
const reader = new NDJSonReader();
reader.on('data', (obj) => console.log(obj));
stream.pipe(reader);
```

### BufferWritableStream

Capture stream data in buffer.

```typescript
class BufferWritableStream extends Writable {
  get(): Promise<Buffer>;
}
```

**Methods:**

#### get()

Get complete buffer after stream ends.

```typescript
get(): Promise<Buffer>
```

**Returns:** Promise resolving to buffer

**Example:**
```typescript
const buffer = new BufferWritableStream();
stream.pipe(buffer);
const data = await buffer.get();
```

### GunzipConditional

Conditionally decompress gzipped streams.

```typescript
class GunzipConditional extends Transform {
  // Automatically detects and decompresses gzip streams
}
```

**Example:**
```typescript
const gunzip = new GunzipConditional();
fileStream.pipe(gunzip).pipe(destination);
```

### sanitizeFilename

Make filename filesystem-safe.

```typescript
function sanitizeFilename(name: string): string
```

**Parameters:**
- `name`: Original filename

**Returns:** Sanitized filename (non-alphanumeric replaced with `_`)

**Example:**
```typescript
sanitizeFilename("my file?.txt");      // "my_file__txt"
sanitizeFilename("user@example.com");  // "user_example_com"
```

### streamToBuffer

Convert readable stream to buffer.

```typescript
function streamToBuffer(stream: Readable): Promise<Buffer>
```

**Parameters:**
- `stream`: Readable stream

**Returns:** Promise resolving to buffer

**Example:**
```typescript
const buffer = await streamToBuffer(readStream);
console.log(buffer.toString());
```

## Validation

### RegExpValidator

Validate strings against regex patterns.

```typescript
class RegExpValidator {
  constructor(info: string | string[]);

  validate(value: string): boolean;
  static getRegExp(reg: string): RegExp;
}
```

**Constructor:**
- `info`: Single pattern or array of patterns

**Methods:**

#### validate()

Check if string matches any pattern.

```typescript
validate(value: string): boolean
```

**Parameters:**
- `value`: String to validate

**Returns:** `true` if matches any pattern

**Example:**
```typescript
const validator = new RegExpValidator([
  "^\\d{3}-\\d{4}$",
  "^[a-z]+@[a-z]+\\.[a-z]+$"
]);

validator.validate("123-4567");  // true
validator.validate("user@example.com");  // true
validator.validate("invalid");  // false
```

#### getRegExp() (static)

Convert string to RegExp with anchors.

```typescript
static getRegExp(reg: string): RegExp
```

**Parameters:**
- `reg`: Regex pattern string

**Returns:** RegExp with `^` and `$` anchors added

### RegExpStringValidator

Validate with exact matches and regex patterns.

```typescript
class RegExpStringValidator extends RegExpValidator {
  constructor(info: string | string[]);

  validate(value: string): boolean;
}
```

**Constructor:**
- `info`: Array of exact strings and `"regex:pattern"` entries

**Methods:**

#### validate()

Check if string matches exactly or matches any regex.

```typescript
validate(value: string): boolean
```

**Parameters:**
- `value`: String to validate

**Returns:** `true` if exact match or regex match

**Example:**
```typescript
const validator = new RegExpStringValidator([
  "admin",                  // Exact
  "superuser",              // Exact
  "regex:^user-\\d+$"       // Regex (must start with "regex:")
]);

validator.validate("admin");     // true
validator.validate("user-123");  // true
validator.validate("invalid");   // false
```

## State Management

### @State Decorator

Track method execution states.

```typescript
function State<E extends string = string>(
  options?: StateOptions<E>
): MethodDecorator

interface StateOptions<S extends string = string> {
  start?: S;   // State when method starts
  end?: S;     // State when method completes
  error?: S;   // State when method throws
}
```

**Parameters:**
- `options`: State transition configuration

**Example:**
```typescript
class Processor {
  @State({
    start: "processing",
    end: "complete",
    error: "failed"
  })
  async process() {
    // Your code
  }
}
```

### State Static Methods

#### getCurrentState()

Get current state of an object.

```typescript
State.getCurrentState(target: any): string
```

**Parameters:**
- `target`: Object instance

**Returns:** Current state string (default: "initial")

#### getStateStatus()

Get detailed state information.

```typescript
State.getStateStatus(target: any): StateStatus

interface StateStatus {
  state: string;
  lastTransition?: number;
  transitions: Array<{
    step: string;
    duration: number;
    exception?: any;
    startTime: number;
    endTime: number;
  }>;
  updateState(newState: string, exception?: any): void;
}
```

**Parameters:**
- `target`: Object instance

**Returns:** StateStatus object with transition history

**Example:**
```typescript
const status = State.getStateStatus(processor);
console.log(status.state);  // "complete"
console.log(status.transitions);  // Array of transitions
```

## Utilities

### getUuid

Generate unique identifiers.

```typescript
function getUuid(
  format?: "ascii" | "base64" | "hex" | "binary" | "uuid"
): string
```

**Parameters:**
- `format`: Output format (default: "uuid")

**Returns:** Generated UUID in specified format

**Formats:**
- `"uuid"`: Standard UUID format (36 chars)
- `"base64"`: URL-safe base64 (22 chars)
- `"hex"`: Hexadecimal (32 chars)
- `"binary"`: Binary buffer as string
- `"ascii"`: ASCII representation

**Example:**
```typescript
getUuid();            // "550e8400-e29b-41d4-a716-446655440000"
getUuid("base64");    // "VQ6EAOKbQdSnFkRmVUQAAA"
getUuid("hex");       // "550e8400e29b41d4a716446655440000"
```

### getCommonJS

Get CommonJS-like variables in ES modules.

```typescript
function getCommonJS(urlInfo: string): {
  __filename: string;
  __dirname: string;
}
```

**Parameters:**
- `urlInfo`: `import.meta.url` value

**Returns:** Object with `__filename` and `__dirname`

**Example:**
```typescript
const { __filename, __dirname } = getCommonJS(import.meta.url);
console.log(__filename);  // /path/to/current/file.js
console.log(__dirname);   // /path/to/current
```

### runWithCurrentDirectory

Execute code in different working directory.

```typescript
function runWithCurrentDirectory(
  dir: string,
  cb: () => any
): any
```

**Parameters:**
- `dir`: Target directory
- `cb`: Function to execute

**Returns:** Result from callback (handles Promises)

**Example:**
```typescript
await runWithCurrentDirectory('/tmp', async () => {
  // Code runs in /tmp
  await doWork();
});
// Working directory restored
```

### deepFreeze

Recursively freeze object.

```typescript
function deepFreeze<T>(object: T): T
```

**Parameters:**
- `object`: Object to freeze

**Returns:** Frozen object (same reference)

**Example:**
```typescript
const config = deepFreeze({
  database: { host: "localhost" }
});

config.database.host = "evil";  // No effect
console.log(config.database.host);  // "localhost"
```

## Type Definitions

### TransformCaseType

```typescript
type TransformCaseType =
  | "none"
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "kebab-case"
  | "ENV_VAR"
  | "UPPERCASE"
  | "lowercase"
```

### WalkerOptionsType

```typescript
type WalkerOptionsType = {
  followSymlinks?: boolean;    // Follow symbolic links
  resolveSymlink?: boolean;    // Use resolved paths
  includeDir?: boolean;        // Include directories
  skipHidden?: boolean;        // Skip hidden files
  maxDepth?: number;           // Maximum depth (default: 100)
}
```

### FinderOptionsType

```typescript
type FinderOptionsType = WalkerOptionsType & {
  filterPattern?: RegExp;      // File filter pattern
}
```

### StateOptions

```typescript
interface StateOptions<S extends string = string> {
  start?: S;   // Starting state
  end?: S;     // Success state
  error?: S;   // Error state
}
```

### StateStatus

```typescript
interface StateStatus {
  state: string;
  lastTransition?: number;
  transitions: Array<{
    step: string;
    duration: number;
    exception?: any;
    startTime: number;
    endTime: number;
  }>;
  updateState(newState: string, exception?: any): void;
}
```

### Format

```typescript
type Format = "json" | "yaml"
```

## Module Exports

All exports from the main package:

```typescript
// Case transformation
export { TransformCase } from './case';
export type { TransformCaseType } from './case';

// Duration
export { Duration } from './duration';

// File size
export { FileSize } from './filesize';

// Async utilities
export {
  Throttler,
  WaitFor,
  WaitLinearDelay,
  WaitExponentialDelay,
  WaitDelayer,
  WaitDelayerFactories,
  sleep,
  nextTick,
  CancelablePromise,
  CancelableLoopPromise
} from './waiter';
export { Throttler } from './throttler';

// File operations
export {
  FileUtils,
  JSONUtils,
  YAMLUtils,
  YAMLProxy,
  JSONCParser,
  NDJSONStream,
  NDJSonReader,
  BufferWritableStream,
  GunzipConditional
} from './serializers';

// Stream utilities
export {
  sanitizeFilename,
  streamToBuffer
} from './stream';

// Validation
export {
  RegExpValidator,
  RegExpStringValidator
} from './regexp';

// State management
export { State } from './state';
export type { StateOptions, StateStatus } from './state';

// Utilities
export { getUuid } from './uuid';
export { getCommonJS } from './esm';
export { runWithCurrentDirectory } from './chdir';
export { deepFreeze } from './index';
```

## Usage Examples

### Complete Application Example

```typescript
import {
  FileUtils,
  TransformCase,
  Duration,
  FileSize,
  Throttler,
  WaitFor,
  WaitExponentialDelay,
  State,
  RegExpStringValidator,
  getUuid
} from '@webda/utils';

class DataProcessor {
  private config: any;
  private timeout: Duration;
  private maxSize: FileSize;
  private urlValidator: RegExpStringValidator;

  constructor(configPath: string) {
    // Load configuration
    this.config = FileUtils.loadConfigurationFile(configPath);
    this.timeout = new Duration(this.config.timeout);
    this.maxSize = new FileSize(this.config.maxFileSize);
    this.urlValidator = new RegExpStringValidator(this.config.allowedUrls);
  }

  @State({
    start: "processing",
    end: "complete",
    error: "failed"
  })
  async processFiles(directory: string): Promise<void> {
    const startTime = Date.now();

    // Find files
    const files = await FileUtils.find(directory, {
      filterPattern: /\.(json|yaml)$/,
      maxDepth: 5
    });

    console.log(`Found ${files.length} files`);

    // Process with throttling
    const throttler = new Throttler(10);

    for (const file of files) {
      throttler.queue(async () => {
        // Check timeout
        if (this.timeout.expired(startTime)) {
          throw new Error("Timeout");
        }

        // Check file size
        const stats = await fs.stat(file);
        if (stats.size > this.maxSize.valueOf()) {
          console.warn(`Skipping large file: ${file}`);
          return;
        }

        // Process with retry
        await WaitFor(
          async () => {
            const data = FileUtils.load(file);

            // Validate URLs
            if (data.url && !this.urlValidator.validate(data.url)) {
              throw new Error(`Invalid URL: ${data.url}`);
            }

            // Transform data
            const processed = {
              id: getUuid("base64"),
              type: TransformCase(data.type, "snake_case"),
              ...data
            };

            // Save
            const outputPath = this.getOutputPath(file);
            FileUtils.save(processed, outputPath);

            return true;
          },
          3,
          `Processing ${file}`,
          new WaitExponentialDelay(100, 2, 2000)
        );
      });
    }

    await throttler.wait();
  }

  private getOutputPath(inputPath: string): string {
    const filename = path.basename(inputPath, path.extname(inputPath));
    return path.join(
      this.config.outputDir,
      `${filename}-processed.json.gz`
    );
  }

  getStatus() {
    const status = State.getStateStatus(this);
    return {
      state: status.state,
      transitions: status.transitions.map(t => ({
        step: t.step,
        duration: t.duration,
        error: t.exception?.message
      }))
    };
  }
}

// Usage
const processor = new DataProcessor("config");
await processor.processFiles("./input");

console.log(processor.getStatus());
```

## Migration Guide

### From Version 3.x to 4.x

Notable changes:

1. **ES Modules Required**: Package now uses ES modules exclusively
2. **Node.js >= 22**: Minimum Node.js version increased
3. **State Decorator**: Reworked to use stage 3 decorators
4. **YAMLProxy**: Improved comment preservation

**Before (3.x):**
```typescript
const { FileUtils } = require('@webda/utils');
```

**After (4.x):**
```typescript
import { FileUtils } from '@webda/utils';
```

## See Also

- [Getting Started](./getting-started.md) - Installation and basic usage
- [Data Transformation](./data-transformation.md) - Case, duration, file size utilities
- [Async Utilities](./async-utilities.md) - Throttling and retry patterns
- [File Operations](./file-operations.md) - File I/O and serialization
- [Validation & State](./validation-state.md) - Input validation and state tracking
