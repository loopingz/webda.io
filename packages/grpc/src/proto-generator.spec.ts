import { suite, test } from "@webda/test";
import * as assert from "assert";
import { generateProto } from "./proto-generator.js";
import type { JSONSchema7 } from "json-schema";

@suite
class ProtoGeneratorTest {
  @test
  emptyOperations() {
    const result = generateProto({}, {});
    assert.ok(result.includes('syntax = "proto3"'));
    assert.ok(result.includes("package webda;"));
    assert.ok(result.includes('import "google/protobuf/empty.proto"'));
    assert.ok(result.includes('import "google/protobuf/struct.proto"'));
    // No services or messages
    assert.ok(!result.includes("service "));
    assert.ok(!result.includes("message "));
  }

  @test
  customPackageName() {
    const result = generateProto({}, {}, "myapp");
    assert.ok(result.includes("package myapp;"));
  }

  @test
  defaultPackageName() {
    const result = generateProto({}, {});
    assert.ok(result.includes("package webda;"));
  }

  @test
  crudOperationsWithInputOutput() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Post": {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" }
        }
      },
      "MyApp/PostResponse": {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" }
        }
      }
    };

    const operations = {
      "Post.Create": {
        input: "MyApp/Post",
        output: "MyApp/PostResponse"
      },
      "Post.Get": {
        output: "MyApp/PostResponse"
      }
    };

    const result = generateProto(operations, schemas);

    // Should create PostService
    assert.ok(result.includes("service PostService {"), "Should group into PostService");
    // Should create Post and PostResponse messages
    assert.ok(result.includes("message Post {"), "Should create Post message");
    assert.ok(result.includes("message PostResponse {"), "Should create PostResponse message");
    // Should create rpcs
    assert.ok(result.includes("rpc Create(Post) returns (PostResponse);"), "Should create Create rpc");
    assert.ok(result.includes("rpc Get(google.protobuf.Empty) returns (PostResponse);"), "Should create Get rpc with Empty input");
  }

  @test
  hiddenOperationsAreSkipped() {
    const operations = {
      "Post.Create": {
        input: "MyApp/Post",
        hidden: true
      },
      "Post.Get": {
        output: "MyApp/PostResponse"
      }
    };
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/PostResponse": {
        type: "object",
        properties: {
          id: { type: "string" }
        }
      }
    };

    const result = generateProto(operations, schemas);

    // Hidden operations should not appear
    assert.ok(!result.includes("rpc Create"), "Hidden operation Create should not appear");
    // But visible ones should
    assert.ok(result.includes("rpc Get"), "Visible operation Get should appear");
  }

  @test
  serviceGroupingByPrefix() {
    const operations = {
      "Post.Create": {},
      "Post.Get": {},
      "User.Login": {},
      "User.Logout": {}
    };

    const result = generateProto(operations, {});

    assert.ok(result.includes("service PostService {"), "Should create PostService");
    assert.ok(result.includes("service UserService {"), "Should create UserService");
    assert.ok(result.includes("rpc Create(google.protobuf.Empty)"), "Should create Create rpc in PostService");
    assert.ok(result.includes("rpc Get(google.protobuf.Empty)"), "Should create Get rpc in PostService");
    assert.ok(result.includes("rpc Login(google.protobuf.Empty)"), "Should create Login rpc in UserService");
    assert.ok(result.includes("rpc Logout(google.protobuf.Empty)"), "Should create Logout rpc in UserService");
  }

  @test
  operationWithoutDotGoesToDefaultService() {
    const operations = {
      Health: {}
    };

    const result = generateProto(operations, {});
    assert.ok(result.includes("service DefaultService {"), "Should create DefaultService for operations without a dot prefix");
    assert.ok(result.includes("rpc Health(google.protobuf.Empty)"), "Should use opId as rpcName");
  }

  @test
  emptyInputOutputUsesGoogleProtobufEmpty() {
    const operations = {
      "Post.List": {}
    };

    const result = generateProto(operations, {});
    assert.ok(
      result.includes("rpc List(google.protobuf.Empty) returns (google.protobuf.Empty);"),
      "Should use google.protobuf.Empty for both input and output when none defined"
    );
  }

  @test
  streamingHints() {
    const operations = {
      "Stream.ServerPush": {
        grpc: { streaming: "server" }
      },
      "Stream.ClientPush": {
        grpc: { streaming: "client" }
      },
      "Stream.Bidi": {
        grpc: { streaming: "bidi" }
      },
      "Stream.Unary": {}
    };

    const result = generateProto(operations, {});

    assert.ok(
      result.includes("rpc ServerPush(google.protobuf.Empty) returns (stream google.protobuf.Empty);"),
      "Server streaming should have 'stream' on output"
    );
    assert.ok(
      result.includes("rpc ClientPush(stream google.protobuf.Empty) returns (google.protobuf.Empty);"),
      "Client streaming should have 'stream' on input"
    );
    assert.ok(
      result.includes("rpc Bidi(stream google.protobuf.Empty) returns (stream google.protobuf.Empty);"),
      "Bidi streaming should have 'stream' on both"
    );
    assert.ok(
      result.includes("rpc Unary(google.protobuf.Empty) returns (google.protobuf.Empty);"),
      "Unary should have no 'stream' keyword"
    );
  }

  @test
  messageGenerationFromJsonSchema() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Item": {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "number" },
          price: { type: "number", format: "float" },
          quantity: { type: "number", format: "int32" },
          bigNum: { type: "number", format: "int64" },
          active: { type: "boolean" },
          rank: { type: "integer" },
          bigRank: { type: "integer", format: "int64" }
        }
      }
    };

    const operations = {
      "Item.Get": {
        output: "MyApp/Item"
      }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("message Item {"), "Should create Item message");
    assert.ok(result.includes("string name = 1;"), "String field");
    assert.ok(result.includes("double count = 2;"), "Number field defaults to double");
    assert.ok(result.includes("float price = 3;"), "Float format");
    assert.ok(result.includes("int32 quantity = 4;"), "Int32 format for number");
    assert.ok(result.includes("int64 bigNum = 5;"), "Int64 format for number");
    assert.ok(result.includes("bool active = 6;"), "Boolean field");
    assert.ok(result.includes("int32 rank = 7;"), "Integer type defaults to int32");
    assert.ok(result.includes("int64 bigRank = 8;"), "Integer with int64 format");
  }

  @test
  stringFormats() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Dates": {
        type: "object",
        properties: {
          created: { type: "string", format: "date-time" },
          birthday: { type: "string", format: "date" },
          bigId: { type: "string", format: "int64" },
          plain: { type: "string" }
        }
      }
    };

    const operations = {
      "Date.Get": { output: "MyApp/Dates" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("string created = 1;"), "date-time maps to string");
    assert.ok(result.includes("string birthday = 2;"), "date maps to string");
    assert.ok(result.includes("int64 bigId = 3;"), "string with int64 format maps to int64");
    assert.ok(result.includes("string plain = 4;"), "plain string");
  }

  @test
  nestedObjectMessage() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Container": {
        type: "object",
        properties: {
          label: { type: "string" },
          metadata: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: "string" }
            }
          }
        }
      }
    };

    const operations = {
      "Container.Get": { output: "MyApp/Container" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("message Container {"), "Should create Container message");
    assert.ok(result.includes("message ContainerMetadata {"), "Should create nested ContainerMetadata message");
    assert.ok(result.includes("ContainerMetadata metadata = 2;"), "Should reference nested message type");
    assert.ok(result.includes("string key = 1;"), "Nested message should have fields");
    assert.ok(result.includes("string value = 2;"), "Nested message should have fields");
  }

  @test
  objectWithoutPropertiesUsesStruct() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Dynamic": {
        type: "object",
        properties: {
          data: { type: "object" } // no properties => Struct
        }
      }
    };

    const operations = {
      "Dynamic.Get": { output: "MyApp/Dynamic" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("google.protobuf.Struct data = 1;"), "Object without properties maps to Struct");
  }

  @test
  arrayField() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/List": {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" }
          },
          numbers: {
            type: "array",
            items: { type: "integer" }
          }
        }
      }
    };

    const operations = {
      "List.Get": { output: "MyApp/List" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("repeated string items = 1;"), "Array of strings should be repeated string");
    assert.ok(result.includes("repeated int32 numbers = 2;"), "Array of integers should be repeated int32");
  }

  @test
  refField() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Order": {
        type: "object",
        properties: {
          item: { $ref: "#/definitions/MyApp/Item" }
        }
      },
      "MyApp/Item": {
        type: "object",
        properties: {
          name: { type: "string" }
        }
      }
    };

    const operations = {
      "Order.Get": { output: "MyApp/Order" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("Item item = 1;"), "Ref should resolve to message name");
  }

  @test
  componentsSchemaRef() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Widget": {
        type: "object",
        properties: {
          part: { $ref: "#/components/schemas/MyApp/Part" }
        }
      }
    };

    const operations = {
      "Widget.Get": { output: "MyApp/Widget" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("Part part = 1;"), "Components schema ref should resolve");
  }

  @test
  operationWithSummary() {
    const operations = {
      "Post.Create": {
        summary: "Create a new post"
      }
    };

    const result = generateProto(operations, {});

    assert.ok(result.includes("// Create a new post"), "Summary should appear as comment before rpc");
  }

  @test
  operationWithInputSchema() {
    const schemas: Record<string, JSONSchema7> = {
      uuidRequest: {
        type: "object",
        properties: {
          uuid: { type: "string" }
        }
      }
    };

    const operations = {
      "Post.Get": {
        input: "uuidRequest",
        output: "MyApp/PostResponse"
      }
    };

    const schemasWithOutput: Record<string, JSONSchema7> = {
      ...schemas,
      "MyApp/PostResponse": {
        type: "object",
        properties: {
          id: { type: "string" }
        }
      }
    };

    const result = generateProto(operations, schemasWithOutput);

    // Input schema should become the input type
    assert.ok(result.includes("message UuidRequest {"), "Should create message from input schema");
    assert.ok(result.includes("rpc Get(UuidRequest) returns (PostResponse);"), "Should use input as input type");
  }

  @test
  inputUsedAsRpcInputType() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/CreateInput": {
        type: "object",
        properties: { title: { type: "string" } }
      }
    };

    const operations = {
      "Post.Create": {
        input: "MyApp/CreateInput"
      }
    };

    const result = generateProto(operations, schemas);

    // input should be used as the RPC input type
    assert.ok(result.includes("rpc Create(CreateInput)"), "Input should be used as RPC input type");
  }

  @test
  schemaToMessageNameHandlesSlashAndDotNotation() {
    const schemas: Record<string, JSONSchema7> = {
      "WebdaSample/Post": {
        type: "object",
        properties: { title: { type: "string" } }
      },
      "my.nested.schema": {
        type: "object",
        properties: { value: { type: "string" } }
      }
    };

    const operations = {
      "Post.Get": { output: "WebdaSample/Post" },
      "Nested.Get": { output: "my.nested.schema" }
    };

    const result = generateProto(operations, schemas);

    // "WebdaSample/Post" → "Post"
    assert.ok(result.includes("message Post {"), "Slash-separated should use last segment");
    // "my.nested.schema" → "MyNestedSchema"
    assert.ok(result.includes("message MyNestedSchema {"), "Dot-separated should be PascalCased and joined");
  }

  @test
  unknownTypeDefaultsToStruct() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Mystery": {
        type: "object",
        properties: {
          unknownField: {} // no type at all
        }
      }
    };

    const operations = {
      "Mystery.Get": { output: "MyApp/Mystery" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("google.protobuf.Struct unknownField = 1;"), "Unknown type should default to Struct");
  }

  @test
  arrayWithoutItemsDefaultsToStruct() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Flexible": {
        type: "object",
        properties: {
          tags: {
            type: "array"
            // no items defined
          }
        }
      }
    };

    const operations = {
      "Flexible.Get": { output: "MyApp/Flexible" }
    };

    const result = generateProto(operations, schemas);

    // Array without items should use Struct as the element type
    assert.ok(result.includes("repeated google.protobuf.Struct tags = 1;"), "Array without items should repeat Struct");
  }

  @test
  numberIntegerFormat() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/NumTypes": {
        type: "object",
        properties: {
          intField: { type: "number", format: "integer" }
        }
      }
    };

    const operations = {
      "NumTypes.Get": { output: "MyApp/NumTypes" }
    };

    const result = generateProto(operations, schemas);

    assert.ok(result.includes("int32 intField = 1;"), "Number with 'integer' format maps to int32");
  }

  @test
  arrayTypeInJsonTypeToProtoRecursion() {
    const schemas: Record<string, JSONSchema7> = {
      "MyApp/Nested": {
        type: "object",
        properties: {
          matrix: {
            type: "array",
            items: {
              type: "array",
              items: { type: "integer" }
            }
          }
        }
      }
    };

    const operations = {
      "Nested.Get": { output: "MyApp/Nested" }
    };

    // This exercises the "array" case within jsonTypeToProto
    const result = generateProto(operations, schemas);
    // The outer array items is an array of integers
    // jsonTypeToProto for "array" type recurses into items
    assert.ok(result.includes("repeated int32 matrix = 1;"), "Nested array should recurse into items");
  }

  @test
  operationWithInputSchemaNotInSchemas() {
    const operations = {
      "Post.Create": {
        input: "MyApp/NonExistent"
      }
    };

    const result = generateProto(operations, {});

    // If schema not found, should use Empty
    assert.ok(result.includes("rpc Create(google.protobuf.Empty)"), "Missing schema should fall back to Empty");
  }

  @test
  operationWithOutputSchemaNotInSchemas() {
    const operations = {
      "Post.Get": {
        output: "MyApp/NonExistent"
      }
    };

    const result = generateProto(operations, {});

    assert.ok(result.includes("returns (google.protobuf.Empty)"), "Missing output schema should fall back to Empty");
  }
}
