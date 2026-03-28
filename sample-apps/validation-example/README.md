# Validation Example

This sample demonstrates how validation works in the Webda ecosystem through **automatic schema generation** and **runtime validation**.

## The Validation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Define Model with JSDoc Annotations                     │
│                                                              │
│     class User extends Model {                              │
│       /**                                                    │
│        * @format email                                       │
│        */                                                    │
│       email: string;                                         │
│                                                              │
│       /**                                                    │
│        * @minimum 0                                          │
│        * @maximum 120                                        │
│        */                                                    │
│       age: number;                                           │
│     }                                                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. @webda/compiler Generates JSON Schemas                  │
│                                                              │
│     Automatically creates 3 schemas per model:              │
│     • User.Input.schema.json   - For creating objects       │
│     • User.Output.schema.json  - For API responses          │
│     • User.Stored.schema.json  - For database storage       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. @webda/core Validates Using AJV                         │
│                                                              │
│     Validation happens automatically on:                     │
│     • Model.create() / Model.fromDTO()                      │
│     • REST API input                                         │
│     • Store operations                                       │
└─────────────────────────────────────────────────────────────┘
```

## JSDoc Annotations Supported

@webda/compiler recognizes standard JSON Schema annotations:

### String Validation
```typescript
/**
 * @format email
 * @minLength 5
 * @maxLength 100
 * @pattern ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
 */
email: string;
```

### Number Validation
```typescript
/**
 * @minimum 0
 * @maximum 120
 * @multipleOf 1
 */
age: number;

/**
 * @minimum 0
 * @exclusiveMinimum true
 */
price: number;
```

### Array Validation
```typescript
/**
 * @minItems 1
 * @maxItems 10
 * @uniqueItems true
 */
tags: string[];
```

### Required Fields
```typescript
/**
 * @required
 */
username: string;
```

### Enums
```typescript
/**
 * @enum ["active", "inactive", "suspended"]
 */
status: "active" | "inactive" | "suspended";
```

## Three Schema Types

### 1. Input Schema
Used when **creating** or **updating** objects via API:
- May have optional fields
- Used for DTO validation
- Excludes auto-generated fields (createdAt, updatedAt)

### 2. Output Schema
Used when **returning** objects from API:
- Includes all fields
- Used for response validation
- Ensures sensitive data is filtered

### 3. Stored Schema
Used when **saving** to database:
- Complete object definition
- Includes internal fields
- Used for data integrity

## Running the Sample

```bash
npm install
npm run dev
```

This will:
1. Run `webdac build` to generate JSON schemas
2. Execute the example showing validation in action
3. Display generated schemas and validation results

## What You'll Learn

1. How to annotate models with JSDoc for validation
2. How @webda/compiler generates schemas automatically
3. How @webda/core validates data using AJV
4. The difference between Input, Output, and Stored schemas
5. How validation errors are reported
6. Custom validation with JSON Schema
