---
sidebar_position: 5
title: File Operations
description: File I/O, serialization, compression, and directory utilities
---

# File Operations

This guide covers utilities for file operations: loading and saving files, directory walking, compression support, and working with multiple file formats.

## FileUtils

The `FileUtils` object provides a comprehensive API for file operations with automatic format detection, compression support, and directory traversal.

### Interface Definition

```typescript
interface FileUtils {
  // File I/O
  load(filename: string, format?: Format): any;
  save(object: any, filename: string, format?: Format): void;

  // Configuration files
  loadConfigurationFile(filename: string, allowImports?: boolean): any;
  getConfigurationFile(filename: string): string;

  // Directory operations
  walk(path: string, processor: (filepath: string) => void, options?: WalkerOptionsType): Promise<void>;
  walkSync(path: string, processor: (filepath: string) => void, options?: WalkerOptionsType): void;
  find(path: string, options?: FinderOptionsType): Promise<string[]>;

  // Stream operations
  getReadStream(path: string): Promise<Readable>;
  getWriteStream(path: string): Promise<Writable>;

  // Utilities
  clean(...files: string[]): void;
}

type Format = "json" | "yaml";
```

## Loading Files

Load files with automatic format detection based on extension.

### Basic Loading

```typescript
import { FileUtils } from '@webda/utils';

// Load JSON
const data = FileUtils.load("config.json");

// Load YAML
const config = FileUtils.load("config.yaml");

// Load JSONC (JSON with comments)
const settings = FileUtils.load("settings.jsonc");
```

### Format Detection

The format is automatically detected from the file extension:
- `.json` → JSON parsing
- `.jsonc` → JSON with comments (JSONC)
- `.yaml` / `.yml` → YAML parsing

```typescript
// Explicit format override
const data = FileUtils.load("config.txt", "json");
const yaml = FileUtils.load("data.txt", "yaml");
```

### Compressed Files

Load compressed files automatically:

```typescript
// Gzip compressed files (auto-decompression)
const data = FileUtils.load("config.json.gz");
const yaml = FileUtils.load("config.yaml.gz");

// Format detected from filename before .gz extension
// config.json.gz → JSON format
// config.yaml.gz → YAML format
```

### Configuration Files

Load configuration files without specifying extensions:

```typescript
// Tries extensions in order: .yaml, .yml, .jsonc, .json
const config = FileUtils.loadConfigurationFile("config");
// Looks for: config.yaml, config.yml, config.jsonc, config.json

// Get the actual file path found
const path = FileUtils.getConfigurationFile("config");
console.log(path);  // "config.yaml" (whichever exists first)
```

### Configuration Imports

Support for `$import` directive in configuration files:

```typescript
// config.yaml
/**
 * $import: "./base-config.yaml"
 * database:
 *   host: localhost
 */

// Loads and merges base-config.yaml automatically
const config = FileUtils.loadConfigurationFile("config");

// Import multiple files
/**
 * $import:
 *   - "./database.yaml"
 *   - "./services.yaml"
 * app:
 *   name: "My App"
 */

// Disable imports
const config = FileUtils.loadConfigurationFile("config", false);
```

## Saving Files

Save objects with automatic format selection and compression.

### Basic Saving

```typescript
import { FileUtils } from '@webda/utils';

const data = { name: "John", age: 30 };

// Save as JSON
FileUtils.save(data, "output.json");

// Save as YAML
FileUtils.save(data, "output.yaml");

// Save as JSONC (preserves comments if loaded with JSONC)
FileUtils.save(data, "output.jsonc");
```

### Compressed Files

Save with automatic compression:

```typescript
const largeData = { /* ... large object ... */ };

// Gzip compressed JSON
FileUtils.save(largeData, "data.json.gz");

// Gzip compressed YAML
FileUtils.save(largeData, "data.yaml.gz");
```

### Format Override

```typescript
// Save with explicit format
FileUtils.save(data, "output.txt", "json");
FileUtils.save(data, "config.txt", "yaml");
```

## Directory Operations

Walk directories and find files with flexible filtering.

### Walking Directories

Recursively traverse all files in a directory:

```typescript
import { FileUtils } from '@webda/utils';

// Process each file
FileUtils.walk("./src", (filepath) => {
  console.log(filepath);
});

// Synchronous version
FileUtils.walkSync("./src", (filepath) => {
  console.log(filepath);
});
```

### Walk Options

```typescript
type WalkerOptionsType = {
  followSymlinks?: boolean;    // Follow symbolic links (default: false)
  resolveSymlink?: boolean;    // Use resolved path (default: false)
  includeDir?: boolean;        // Include directories (default: false)
  skipHidden?: boolean;        // Skip hidden files (default: false)
  maxDepth?: number;           // Maximum depth (default: 100)
};

// Example with options
await FileUtils.walk("./src",
  (filepath) => {
    console.log(filepath);
  },
  {
    followSymlinks: true,
    skipHidden: true,
    maxDepth: 5
  }
);
```

### Finding Files

Find files matching specific criteria:

```typescript
// Find all TypeScript files
const tsFiles = await FileUtils.find("./src", {
  filterPattern: /\.ts$/
});

console.log(`Found ${tsFiles.length} TypeScript files`);
tsFiles.forEach(file => console.log(file));

// Find with custom filter
const files = await FileUtils.find("./src", {
  filterPattern: /\.ts$/,
  maxDepth: 3,
  skipHidden: true
});

// Find all files (no filter)
const allFiles = await FileUtils.find("./src");
```

### Practical Examples

#### Process All JSON Files

```typescript
const jsonFiles = await FileUtils.find("./data", {
  filterPattern: /\.json$/
});

for (const file of jsonFiles) {
  const data = FileUtils.load(file);
  // Process data
  console.log(`Processed ${file}`);
}
```

#### Convert YAML to JSON

```typescript
await FileUtils.walk("./config", (filepath) => {
  if (filepath.endsWith(".yaml") || filepath.endsWith(".yml")) {
    const data = FileUtils.load(filepath);
    const newPath = filepath.replace(/\.ya?ml$/, ".json");
    FileUtils.save(data, newPath);
    console.log(`Converted ${filepath} → ${newPath}`);
  }
});
```

#### Find Large Files

```typescript
import { FileSize } from '@webda/utils';
import { statSync } from 'fs';

const maxSize = new FileSize("10 MB");

await FileUtils.walk("./uploads", (filepath) => {
  const stats = statSync(filepath);
  if (stats.size > maxSize.valueOf()) {
    console.log(
      `Large file: ${filepath} (${new FileSize(stats.size).toString()})`
    );
  }
});
```

## File Cleanup

Delete files if they exist:

```typescript
import { FileUtils } from '@webda/utils';

// Delete single file
FileUtils.clean("temp.json");

// Delete multiple files
FileUtils.clean("temp1.json", "temp2.json", "temp3.json");

// Delete files that may not exist (no error if missing)
FileUtils.clean(
  "output/data.json",
  "output/backup.json",
  "logs/debug.log"
);
```

## JSONUtils

Utilities for working with JSON data.

### Safe Stringify

Handle circular references safely:

```typescript
import { JSONUtils } from '@webda/utils';

const obj = { name: "test" };
obj.self = obj;  // Circular reference

// Regular JSON.stringify would throw
// JSON.stringify(obj);  // Error!

// Safe stringify handles circular references
const json = JSONUtils.safeStringify(obj);
console.log(json);  // {"name":"test"}
```

### Enhanced Stringify

Stringify with additional features:

```typescript
// Standard stringify with private field filtering
const data = {
  name: "John",
  __private: "secret",  // Will be filtered
  age: 30
};

const json = JSONUtils.stringify(data, undefined, 2, true);
// {"name":"John","age":30}  (__private removed)

// Custom replacer
const custom = JSONUtils.stringify(
  data,
  (key, value) => {
    if (key === "age") return undefined;  // Skip age field
    return value;
  },
  2
);
```

### Parse with Comments

Parse JSON with comments (JSONC):

```typescript
const jsonc = `
{
  // This is a comment
  "name": "John",
  /* Multi-line
     comment */
  "age": 30
}
`;

const data = JSONUtils.parse(jsonc);
console.log(data);  // { name: "John", age: 30 }
```

### Object Duplication

Deep clone objects:

```typescript
const original = {
  name: "John",
  address: { city: "NYC" }
};

const copy = JSONUtils.duplicate(original);
copy.address.city = "LA";

console.log(original.address.city);  // "NYC" (unchanged)
console.log(copy.address.city);      // "LA"
```

### Sort Object Keys

Sort object keys alphabetically:

```typescript
const unordered = {
  zebra: 1,
  apple: 2,
  mango: 3
};

const sorted = JSONUtils.sortObject(unordered);
console.log(Object.keys(sorted));  // ["apple", "mango", "zebra"]

// With transformer
const filtered = JSONUtils.sortObject(
  unordered,
  (value) => value > 1 ? value : null  // Filter out values <= 1
);
// { mango: 3, zebra: 1 }
```

### File Operations

```typescript
// Load JSON file
const data = JSONUtils.loadFile("config.json");

// Save JSON file
JSONUtils.saveFile({ name: "test" }, "output.json");
```

## YAMLUtils

Utilities for working with YAML data.

### Parse YAML

Parse single or multiple YAML documents:

```typescript
import { YAMLUtils } from '@webda/utils';

// Single document
const yaml = `
name: John
age: 30
`;

const data = YAMLUtils.parse(yaml);
console.log(data);  // { name: "John", age: 30 }

// Multiple documents
const multiYaml = `
---
name: John
---
name: Jane
`;

const docs = YAMLUtils.parse(multiYaml);
console.log(docs);  // [{ name: "John" }, { name: "Jane" }]
```

### Stringify YAML

Convert objects to YAML:

```typescript
const data = {
  name: "John",
  address: {
    city: "NYC",
    zip: "10001"
  }
};

const yaml = YAMLUtils.stringify(data);
console.log(yaml);
// name: John
// address:
//   city: NYC
//   zip: '10001'

// With options (https://eemeli.org/yaml/v1/)
const formatted = YAMLUtils.stringify(data, {
  indent: 4,
  lineWidth: 80
});
```

### File Operations

```typescript
// Load YAML file
const config = YAMLUtils.loadFile("config.yaml");

// Save YAML file
YAMLUtils.saveFile({ name: "test" }, "output.yaml");
```

### Object Duplication

```typescript
const original = { name: "test", nested: { value: 1 } };
const copy = YAMLUtils.duplicate(original);  // Deep clone
```

## YAMLProxy

Preserve YAML comments and formatting when modifying files.

### Basic Usage

```typescript
import { YAMLProxy } from '@webda/utils';

const yaml = `
# Database configuration
database:
  host: localhost  # Development server
  port: 5432
`;

// Parse with comment preservation
const config = YAMLProxy.parse(yaml);

// Modify values
config.database.host = "production.db.com";
config.database.port = 3306;

// Stringify preserves comments and structure
const output = YAMLProxy.stringify(config);
console.log(output);
// # Database configuration
// database:
//   host: production.db.com  # Development server
//   port: 3306
```

### Modifying Arrays

```typescript
const yaml = `
# Server list
servers:
  - host: server1.com
  - host: server2.com
`;

const config = YAMLProxy.parse(yaml);

// Array operations preserve comments
config.servers.push({ host: "server3.com" });
config.servers[0].host = "new-server1.com";

const output = YAMLProxy.stringify(config);
// Comments and structure preserved
```

### Adding Properties

```typescript
const config = YAMLProxy.parse(yaml);

// Add new properties
config.database.username = "admin";
config.database.password = "secret";

// Properties added with proper formatting
const output = YAMLProxy.stringify(config);
```

### Multiple Documents

```typescript
const multiDoc = `
---
name: config1
---
name: config2
`;

const docs = YAMLProxy.parse(multiDoc);
// Returns array of proxied documents

docs[0].name = "updated-config1";
docs[1].value = "new-value";

const output = YAMLProxy.stringify(docs);
// Both documents updated with separator preserved
```

## JSONCParser

Parse and manipulate JSON with comments while preserving formatting.

### Parse JSONC

```typescript
import { JSONCParser } from '@webda/utils';

const jsonc = `
{
  // Configuration file
  "name": "MyApp",
  /* Database settings */
  "database": {
    "host": "localhost", // Dev server
    "port": 5432
  }
}
`;

const config = JSONCParser.parse(jsonc);
console.log(config.name);  // "MyApp"
console.log(config.database.host);  // "localhost"
```

### Preserve Comments on Modification

```typescript
const config = JSONCParser.parse(jsonc);

// Modify values
config.database.host = "production.com";
config.database.port = 3306;

// Stringify preserves comments
const output = JSONCParser.stringify(config);
// Comments and original formatting preserved
```

### Add Properties

```typescript
const config = JSONCParser.parse(jsonc);

// Add new properties (inherits formatting)
config.database.username = "admin";

const output = JSONCParser.stringify(config);
// New property added with same indentation style
```

## Stream Utilities

Utilities for working with Node.js streams.

### NDJSONStream

Create a readable stream of newline-delimited JSON:

```typescript
import { NDJSONStream } from '@webda/utils';

const data = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" }
];

const stream = new NDJSONStream(data);

stream.on('data', (chunk) => {
  console.log(chunk.toString());
  // {"id":1,"name":"Alice"}
  // {"id":2,"name":"Bob"}
  // {"id":3,"name":"Charlie"}
});
```

### NDJSONReader

Read newline-delimited JSON from a stream:

```typescript
import { NDJSonReader } from '@webda/utils';
import { createReadStream } from 'fs';

const reader = new NDJSonReader();

reader.on('data', (obj) => {
  console.log('Parsed object:', obj);
});

// Pipe from file stream
createReadStream('data.ndjson').pipe(reader);
```

### BufferWritableStream

Capture stream data in a buffer:

```typescript
import { BufferWritableStream } from '@webda/utils';

const stream = new BufferWritableStream();

// Write data
stream.write('Hello ');
stream.write('World!');
stream.end();

// Get complete buffer
const buffer = await stream.get();
console.log(buffer.toString());  // "Hello World!"
```

### GunzipConditional

Decompress gzipped streams automatically:

```typescript
import { GunzipConditional } from '@webda/utils';
import { createReadStream } from 'fs';

const stream = createReadStream('data.json.gz');
const gunzip = new GunzipConditional();

stream
  .pipe(gunzip)  // Auto-detects and decompresses if gzipped
  .pipe(process.stdout);
```

### sanitizeFilename

Clean filenames for safe filesystem use:

```typescript
import { sanitizeFilename } from '@webda/utils';

const unsafe = "my file?.txt";
const safe = sanitizeFilename(unsafe);
console.log(safe);  // "my_file__txt"

// Replaces all non-alphanumeric characters with underscores
const filename = sanitizeFilename("user@example.com");
console.log(filename);  // "user_example_com"
```

### streamToBuffer

Convert a readable stream to a buffer:

```typescript
import { streamToBuffer } from '@webda/utils';
import { createReadStream } from 'fs';

const stream = createReadStream('data.txt');
const buffer = await streamToBuffer(stream);

console.log(buffer.toString());  // File contents
```

## Practical Examples

### Configuration Manager

```typescript
import { FileUtils, YAMLProxy } from '@webda/utils';

class ConfigManager {
  private configPath: string;
  private config: any;

  constructor(configPath: string = "config") {
    this.configPath = configPath;
    this.load();
  }

  load(): void {
    try {
      const fullPath = FileUtils.getConfigurationFile(this.configPath);
      const content = readFileSync(fullPath, 'utf-8');
      this.config = YAMLProxy.parse(content);
    } catch (error) {
      console.error("Failed to load config:", error);
      this.config = {};
    }
  }

  get(key: string): any {
    return this.config[key];
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }

  save(): void {
    const fullPath = FileUtils.getConfigurationFile(this.configPath);
    const content = YAMLProxy.stringify(this.config);
    writeFileSync(fullPath, content);
  }
}

const config = new ConfigManager();
config.set("database.host", "localhost");
config.save();  // Preserves comments and formatting
```

### Batch File Processor

```typescript
import { FileUtils, Throttler } from '@webda/utils';

class BatchProcessor {
  async processDirectory(inputDir: string, outputDir: string) {
    const files = await FileUtils.find(inputDir, {
      filterPattern: /\.(json|yaml)$/
    });

    const throttler = new Throttler(10);

    for (const file of files) {
      throttler.queue(async () => {
        const data = FileUtils.load(file);
        const processed = this.transform(data);

        const filename = path.basename(file, path.extname(file));
        const outputPath = path.join(outputDir, `${filename}.json`);

        FileUtils.save(processed, outputPath);
        console.log(`Processed: ${file}`);
      });
    }

    await throttler.wait();
  }

  private transform(data: any): any {
    // Your transformation logic
    return data;
  }
}

const processor = new BatchProcessor();
await processor.processDirectory("./input", "./output");
```

### Archive Manager

```typescript
import { FileUtils, FileSize } from '@webda/utils';

class ArchiveManager {
  async archiveOldFiles(directory: string, maxAge: number) {
    const now = Date.now();
    const archived: string[] = [];

    await FileUtils.walk(directory, async (filepath) => {
      const stats = statSync(filepath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        // Compress old file
        const data = FileUtils.load(filepath);
        const archivePath = filepath + ".gz";

        FileUtils.save(data, archivePath);
        FileUtils.clean(filepath);

        archived.push(filepath);

        const originalSize = new FileSize(stats.size);
        const compressedSize = new FileSize(statSync(archivePath).size);
        console.log(
          `Archived ${filepath}: ${originalSize.toString()} → ` +
          `${compressedSize.toString()}`
        );
      }
    });

    return archived;
  }
}

const manager = new ArchiveManager();
await manager.archiveOldFiles("./logs", 30 * 24 * 60 * 60 * 1000);  // 30 days
```

### Migration Tool

```typescript
import { FileUtils, TransformCase } from '@webda/utils';

class MigrationTool {
  async migrateConfigs(directory: string) {
    await FileUtils.walk(directory, (filepath) => {
      if (!filepath.endsWith('.json')) return;

      const data = FileUtils.load(filepath);
      const migrated = this.migrateKeys(data);

      // Save as YAML with .gz compression
      const newPath = filepath.replace('.json', '.yaml.gz');
      FileUtils.save(migrated, newPath);

      console.log(`Migrated: ${filepath} → ${newPath}`);
    });
  }

  private migrateKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.migrateKeys(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Convert camelCase to snake_case
      const newKey = TransformCase(key, "snake_case");
      result[newKey] = this.migrateKeys(value);
    }
    return result;
  }
}

const tool = new MigrationTool();
await tool.migrateConfigs("./config");
```

## Best Practices

### 1. Use Compression for Large Files

```typescript
// Good: Compress large data files
const largeData = generateLargeDataset();
FileUtils.save(largeData, "data.json.gz");

// Bad: Uncompressed large files waste space
FileUtils.save(largeData, "data.json");
```

### 2. Preserve Comments in Config Files

```typescript
// Good: Use YAMLProxy to preserve comments
const config = YAMLProxy.parse(readFileSync("config.yaml", "utf-8"));
config.database.host = "new-host";
writeFileSync("config.yaml", YAMLProxy.stringify(config));

// Bad: Regular parse loses comments
const config = FileUtils.load("config.yaml");
FileUtils.save(config, "config.yaml");  // Comments lost!
```

### 3. Limit Directory Traversal Depth

```typescript
// Good: Set reasonable maxDepth
const files = await FileUtils.find("./node_modules", {
  filterPattern: /package\.json$/,
  maxDepth: 3  // Prevent deep traversal
});

// Bad: Unlimited depth can be slow
const files = await FileUtils.find("./node_modules", {
  filterPattern: /package\.json$/
  // No maxDepth set
});
```

### 4. Clean Up Temporary Files

```typescript
try {
  // Process files
  await processData();
} finally {
  // Always clean up
  FileUtils.clean(
    "temp1.json",
    "temp2.json",
    "cache.json"
  );
}
```

## Next Steps

- [Validation & State](./validation-state.md) - Input validation and state tracking
- [API Reference](./api-reference.md) - Complete API documentation
