import { Model, WEBDA_PRIMARY_KEY, registerRepository, MemoryRepository } from "@webda/models";

/**
 * Example 1: Single Primary Key
 *
 * When you define a single key, getPrimaryKey() returns the raw value type.
 * This is the most common use case.
 */
export class User extends Model {
  // The 'as const' assertion is CRITICAL - it tells TypeScript this is a literal tuple
  // Without it, TypeScript would see this as string[] and lose type information
  [WEBDA_PRIMARY_KEY] = ["uuid"] as const;

  uuid!: string;
  name!: string;
  email!: string;
  createdAt!: Date;
}

/**
 * Example 2: Composite Primary Key
 *
 * For composite keys, getPrimaryKey() returns Pick<this, ...keys> & { toString(): string }
 * This gives you type-safe access to all key fields plus string serialization.
 */
export class OrderItem extends Model {
  [WEBDA_PRIMARY_KEY] = ["orderId", "itemId"] as const;

  orderId!: string;
  itemId!: string;
  productName!: string;
  quantity!: number;
  price!: number;
}

/**
 * Example 3: Multi-field Composite Key
 *
 * You can have as many key fields as needed.
 */
export class TimeSeriesDataPoint extends Model {
  [WEBDA_PRIMARY_KEY] = ["sensorId", "timestamp", "metricType"] as const;

  sensorId!: string;
  timestamp!: number;
  metricType!: string;
  value!: number;
}

/**
 * Example 4: Model with Date Deserialization
 *
 * Shows how to properly handle Date fields with automatic deserialization.
 */
export class Event extends Model {
  [WEBDA_PRIMARY_KEY] = ["eventId"] as const;

  eventId!: string;
  title!: string;
  startDate!: Date;
  endDate!: Date;

  test() {
    return {
      startDate: Date,
      endDate: Date
    };
  }

  // Define deserializers to automatically convert JSON strings to Date objects
  static getDeserializers() {
    return {
      startDate: Model.DefaultDeserializer.Date,
      endDate: Model.DefaultDeserializer.Date
    } as any;
  }
}

// Register serializers for proper JSON handling
User.registerSerializer();
OrderItem.registerSerializer();
TimeSeriesDataPoint.registerSerializer();
Event.registerSerializer();

async function demonstrateSingleKey() {
  console.log("\n=== Example 1: Single Primary Key ===\n");

  // Setup repository
  const userRepo = new MemoryRepository(User, ["uuid"]);
  registerRepository(User, userRepo);

  // Create a user
  const user = await User.create({
    uuid: "user-123",
    name: "Alice Johnson",
    email: "alice@example.com",
    createdAt: new Date()
  });

  console.log("Created user:", user.name);

  // Get primary key - TypeScript knows this returns string
  const pk = user.getPrimaryKey();
  console.log("Primary key type:", typeof pk); // "string"
  console.log("Primary key value:", pk); // "user-123"

  // Get UUID (same as primary key for single-key models)
  console.log("UUID:", user.getUUID()); // "user-123"

  // Type-safe reference
  const userRef = User.ref("user-456");
  await userRef.upsert({
    name: "Bob Smith",
    email: "bob@example.com",
    createdAt: new Date()
  } as any);

  const retrievedUser = await userRef.get();
  console.log("Retrieved user:", retrievedUser?.name);
}

async function demonstrateCompositeKey() {
  console.log("\n=== Example 2: Composite Primary Key ===\n");

  // Setup repository
  const orderItemRepo = new MemoryRepository(OrderItem, ["orderId", "itemId"]);
  registerRepository(OrderItem, orderItemRepo);

  // Create an order item
  const item = await OrderItem.create({
    orderId: "order-789",
    itemId: "item-456",
    productName: "Laptop",
    quantity: 2,
    price: 999.99
  });

  console.log("Created order item:", item.productName);

  // Get primary key - TypeScript knows this returns Pick<OrderItem, "orderId" | "itemId">
  const pk = item.getPrimaryKey();
  console.log("\nPrimary key is an object:");
  console.log("  orderId:", pk.orderId); // ✅ Type-safe access
  console.log("  itemId:", pk.itemId); // ✅ Type-safe access
  // console.log(pk.quantity);             // ❌ TypeScript error!

  // The primary key object has a toString() method for serialization
  console.log("  toString():", pk.toString()); // "order-789_item-456"

  // Get UUID - combines all key fields with underscore separator
  console.log("\nUUID:", item.getUUID()); // "order-789_item-456"

  // Type-safe reference with composite key
  const itemRef = OrderItem.ref({
    orderId: "order-789",
    itemId: "item-999"
  });

  await itemRef.upsert({
    productName: "Mouse",
    quantity: 5,
    price: 29.99
  } as any);

  const retrievedItem = await itemRef.get();
  console.log("\nRetrieved item:", retrievedItem?.productName);

  // Query all items
  const allItems = await OrderItem.query("");
  console.log("\nTotal items in repository:", allItems.results.length);
}

async function demonstrateMultiFieldKey() {
  console.log("\n=== Example 3: Multi-field Composite Key ===\n");

  // Setup repository
  const dataPointRepo = new MemoryRepository(TimeSeriesDataPoint, ["sensorId", "timestamp", "metricType"]);
  registerRepository(TimeSeriesDataPoint, dataPointRepo);

  // Create data points
  const dataPoint = await TimeSeriesDataPoint.create({
    sensorId: "sensor-001",
    timestamp: Date.now(),
    metricType: "temperature",
    value: 23.5
  });

  console.log("Created data point for sensor:", dataPoint.sensorId);

  // Get primary key - returns Pick<TimeSeriesDataPoint, "sensorId" | "timestamp" | "metricType">
  const pk = dataPoint.getPrimaryKey();
  console.log("\nPrimary key has 3 fields:");
  console.log("  sensorId:", pk.sensorId);
  console.log("  timestamp:", pk.timestamp);
  console.log("  metricType:", pk.metricType);

  // UUID combines all fields
  console.log("\nUUID:", dataPoint.getUUID());

  // Create another metric for the same sensor
  await TimeSeriesDataPoint.create({
    sensorId: "sensor-001",
    timestamp: Date.now() + 1000,
    metricType: "humidity",
    value: 65.2
  });

  const allDataPoints = await TimeSeriesDataPoint.query("");
  console.log("\nTotal data points:", allDataPoints.results.length);
}

async function demonstrateDateDeserialization() {
  console.log("\n=== Example 4: Date Deserialization ===\n");

  // Setup repository
  const eventRepo = new MemoryRepository(Event, ["eventId"]);
  registerRepository(Event, eventRepo);

  // Create event with Date objects
  const event = await Event.create({
    eventId: "event-123",
    title: "Team Meeting",
    startDate: new Date("2026-02-01T10:00:00Z"),
    endDate: new Date("2026-02-01T11:00:00Z")
  });

  console.log("Created event:", event.title);
  console.log("Start date is Date object:", event.startDate instanceof Date);
  console.log("Start date:", event.startDate.toISOString());

  // Simulate JSON round-trip (what happens when loading from database)
  const json = JSON.stringify(event);
  console.log("\nJSON representation:", json);

  // Load from JSON - deserializers automatically convert strings back to Date
  const loadedEvent = new Event(JSON.parse(json));
  console.log("\nAfter deserialization:");
  console.log("Start date is still Date object:", loadedEvent.startDate instanceof Date);
  console.log("Start date:", loadedEvent.startDate.toISOString());
}

async function demonstrateTypeInference() {
  console.log("\n=== Type Inference Magic ===\n");

  console.log("This is the key innovation of @webda/models:\n");

  console.log("1. Single key models:");
  console.log("   User.getPrimaryKey() → returns string");
  console.log("   Type-safe, zero overhead\n");

  console.log("2. Composite key models:");
  console.log("   OrderItem.getPrimaryKey() → returns { orderId: string, itemId: string, toString(): string }");
  console.log("   Full IDE autocomplete on key fields\n");

  console.log("3. Why symbols?");
  console.log("   Decorators are runtime-only and can't influence TypeScript's type system");
  console.log("   Symbols with 'as const' provide compile-time type information");
  console.log("   This enables conditional return types based on your key configuration\n");

  console.log("4. Zero runtime cost:");
  console.log("   All type inference happens at compile time");
  console.log("   No performance penalty in production\n");
}

// Run all demonstrations
async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  @webda/models - Basic Models Sample                          ║");
  console.log("║  Demonstrating Compile-Time Type Inference for Primary Keys   ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  try {
    await demonstrateSingleKey();
    await demonstrateCompositeKey();
    await demonstrateMultiFieldKey();
    await demonstrateDateDeserialization();
    await demonstrateTypeInference();

    console.log("\n✅ All examples completed successfully!");
    console.log("\nKey Takeaways:");
    console.log("• Single keys return the raw value type (e.g., string)");
    console.log("• Composite keys return Pick<Model, ...keys> for type safety");
    console.log("• Symbol-based approach enables compile-time type inference");
    console.log("• Decorators cannot provide this level of type safety");
    console.log("• Full IDE autocomplete with zero runtime overhead\n");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
