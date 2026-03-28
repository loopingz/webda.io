import { UuidModel, registerRepository, MemoryRepository } from "@webda/models";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Example User Model with Validation Annotations
 *
 * These JSDoc annotations are processed by @webda/compiler to generate JSON schemas.
 * The schemas are then used by @webda/core for runtime validation.
 */
class User extends UuidModel {
  /**
   * User's email address
   * @format email
   * @minLength 5
   * @maxLength 100
   */
  email!: string;

  /**
   * User's full name
   * @minLength 2
   * @maxLength 50
   */
  name!: string;

  /**
   * User's age
   * @minimum 0
   * @maximum 120
   * @multipleOf 1
   */
  age!: number;

  /**
   * User's account status
   * @enum ["active", "inactive", "suspended"]
   */
  status!: "active" | "inactive" | "suspended";

  /**
   * User's tags
   * @minItems 0
   * @maxItems 10
   * @uniqueItems true
   */
  tags!: string[];

  /**
   * User's bio (optional)
   * @maxLength 500
   */
  bio?: string;

  /**
   * Account creation date
   */
  createdAt!: Date;

  /**
   * Last update date
   */
  updatedAt!: Date;

  static getDeserializers() {
    return {
      createdAt: UuidModel.DefaultDeserializer.Date,
      updatedAt: UuidModel.DefaultDeserializer.Date,
    };
  }
}

/**
 * Product model demonstrating numeric validation
 */
class Product extends UuidModel {
  /**
   * Product name
   * @minLength 3
   * @maxLength 100
   */
  name!: string;

  /**
   * Product price in cents
   * @minimum 0
   * @exclusiveMinimum true
   * @description Price must be greater than 0
   */
  price!: number;

  /**
   * Stock quantity
   * @minimum 0
   * @multipleOf 1
   */
  stock!: number;

  /**
   * Product SKU
   * @pattern ^[A-Z]{3}-[0-9]{6}$
   * @description Must match format: ABC-123456
   */
  sku!: string;

  /**
   * Categories
   * @minItems 1
   * @maxItems 5
   */
  categories!: string[];
}

User.registerSerializer();
Product.registerSerializer();

function setupRepositories() {
  registerRepository(User, new MemoryRepository(User, ["uuid"]));
  registerRepository(Product, new MemoryRepository(Product, ["uuid"]));
}

function displayGeneratedSchemas() {
  console.log("\n=== Generated JSON Schemas ===\n");

  const schemasPath = join(process.cwd(), "lib", "schemas");

  // Check if schemas were generated
  if (!existsSync(schemasPath)) {
    console.log("⚠️  Schemas not found. Run 'npm run build' first to generate schemas.");
    console.log("    @webda/compiler generates schemas during the build process.");
    return;
  }

  // Display User schemas
  const userInputPath = join(schemasPath, "User.Input.schema.json");
  const userOutputPath = join(schemasPath, "User.Output.schema.json");
  const userStoredPath = join(schemasPath, "User.Stored.schema.json");

  if (existsSync(userInputPath)) {
    console.log("📄 User.Input.schema.json (for creating/updating):");
    const inputSchema = JSON.parse(readFileSync(userInputPath, "utf-8"));
    console.log(JSON.stringify(inputSchema, null, 2));
    console.log();
  }

  if (existsSync(userOutputPath)) {
    console.log("📄 User.Output.schema.json (for API responses):");
    const outputSchema = JSON.parse(readFileSync(userOutputPath, "utf-8"));
    console.log(JSON.stringify(outputSchema, null, 2));
    console.log();
  }

  if (existsSync(userStoredPath)) {
    console.log("📄 User.Stored.schema.json (for database storage):");
    const storedSchema = JSON.parse(readFileSync(userStoredPath, "utf-8"));
    console.log(JSON.stringify(storedSchema, null, 2));
    console.log();
  }
}

async function demonstrateValidValidation() {
  console.log("\n=== Example 1: Valid Data ===\n");

  try {
    const user = await User.create({
      uuid: "user-123",
      email: "alice@example.com",
      name: "Alice Johnson",
      age: 30,
      status: "active",
      tags: ["developer", "typescript"],
      bio: "Software engineer passionate about TypeScript",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log("✅ User created successfully!");
    console.log("   Name:", user.name);
    console.log("   Email:", user.email);
    console.log("   Status:", user.status);
    console.log("   Tags:", user.tags.join(", "));

  } catch (error: any) {
    console.error("❌ Validation failed:", error.message);
  }
}

async function demonstrateInvalidEmail() {
  console.log("\n=== Example 2: Invalid Email Format ===\n");

  try {
    await User.create({
      uuid: "user-456",
      email: "not-an-email", // ❌ Invalid email format
      name: "Bob Smith",
      age: 25,
      status: "active",
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log("✅ User created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: email");
    console.log("   Constraint: @format email");
  }
}

async function demonstrateInvalidAge() {
  console.log("\n=== Example 3: Invalid Age (Out of Range) ===\n");

  try {
    await User.create({
      uuid: "user-789",
      email: "charlie@example.com",
      name: "Charlie Brown",
      age: 150, // ❌ Exceeds maximum of 120
      status: "active",
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log("✅ User created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: age");
    console.log("   Constraint: @maximum 120");
  }
}

async function demonstrateInvalidStatus() {
  console.log("\n=== Example 4: Invalid Enum Value ===\n");

  try {
    await User.create({
      uuid: "user-abc",
      email: "diana@example.com",
      name: "Diana Prince",
      age: 28,
      status: "pending" as any, // ❌ Not in enum ["active", "inactive", "suspended"]
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log("✅ User created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: status");
    console.log("   Constraint: @enum [\"active\", \"inactive\", \"suspended\"]");
  }
}

async function demonstrateStringLength() {
  console.log("\n=== Example 5: String Length Validation ===\n");

  try {
    await User.create({
      uuid: "user-def",
      email: "eve@example.com",
      name: "E", // ❌ Too short (minLength: 2)
      age: 32,
      status: "active",
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log("✅ User created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: name");
    console.log("   Constraint: @minLength 2");
  }
}

async function demonstrateArrayValidation() {
  console.log("\n=== Example 6: Array Validation (Too Many Items) ===\n");

  try {
    await User.create({
      uuid: "user-ghi",
      email: "frank@example.com",
      name: "Frank Miller",
      age: 35,
      status: "active",
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11"], // ❌ Exceeds maxItems: 10
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log("✅ User created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: tags");
    console.log("   Constraint: @maxItems 10");
  }
}

async function demonstrateProductValidation() {
  console.log("\n=== Example 7: Product with Pattern Validation ===\n");

  // Valid product
  console.log("Creating valid product...");
  try {
    const product = await Product.create({
      uuid: "prod-123",
      name: "Laptop",
      price: 99999, // $999.99 in cents
      stock: 50,
      sku: "LAP-123456", // ✅ Matches pattern
      categories: ["electronics", "computers"]
    });

    console.log("✅ Product created successfully!");
    console.log("   Name:", product.name);
    console.log("   SKU:", product.sku);
    console.log("   Price: $" + (product.price / 100).toFixed(2));

  } catch (error: any) {
    console.error("❌ Validation failed:", error.message);
  }

  // Invalid SKU pattern
  console.log("\nTrying invalid SKU pattern...");
  try {
    await Product.create({
      uuid: "prod-456",
      name: "Mouse",
      price: 2999,
      stock: 100,
      sku: "INVALID-SKU", // ❌ Doesn't match pattern ^[A-Z]{3}-[0-9]{6}$
      categories: ["electronics"]
    });

    console.log("✅ Product created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: sku");
    console.log("   Constraint: @pattern ^[A-Z]{3}-[0-9]{6}$");
    console.log("   Must match format: ABC-123456");
  }

  // Invalid price (must be > 0)
  console.log("\nTrying zero price...");
  try {
    await Product.create({
      uuid: "prod-789",
      name: "Keyboard",
      price: 0, // ❌ Must be > 0 (exclusiveMinimum: true)
      stock: 25,
      sku: "KEY-789012",
      categories: ["electronics"]
    });

    console.log("✅ Product created (unexpected!)");

  } catch (error: any) {
    console.log("❌ Validation failed (expected):");
    console.log("   Error:", error.message);
    console.log("   Field: price");
    console.log("   Constraint: @minimum 0 @exclusiveMinimum true");
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  @webda/models - Validation Example                           ║");
  console.log("║  Demonstrating Automatic Schema Generation & Validation       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  setupRepositories();

  // Show generated schemas
  displayGeneratedSchemas();

  try {
    // Run validation demonstrations
    await demonstrateValidValidation();
    await demonstrateInvalidEmail();
    await demonstrateInvalidAge();
    await demonstrateInvalidStatus();
    await demonstrateStringLength();
    await demonstrateArrayValidation();
    await demonstrateProductValidation();

    console.log("\n✅ All validation examples completed!");
    console.log("\nKey Takeaways:");
    console.log("• JSDoc annotations define validation rules");
    console.log("• @webda/compiler generates Input/Output/Stored schemas");
    console.log("• @webda/core validates using AJV automatically");
    console.log("• Validation happens at creation, update, and API boundaries");
    console.log("• Comprehensive error messages for debugging");
    console.log("• Zero boilerplate - just annotate your models\n");

  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

main();
