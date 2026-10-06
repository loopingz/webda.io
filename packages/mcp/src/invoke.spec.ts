import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Session, WebdaError } from "@webda/core";
import { McpFixtureTest, registerFixture } from "../test/fixture.js";
import { CancelledError, errorToToolResult, runOperation, toToolResult, truncateUtf8 } from "./invoke.js";
import { operationToTool } from "./tools.js";

const echoEntry = () =>
  operationToTool(
    "Fixture.Echo",
    { id: "Fixture.Echo", input: "void", output: "Fixture.Echo.output", method: "echo" },
    () => ({
      type: "object",
      properties: { text: { type: "string" } }
    })
  );
const plainEntry = (id: string) =>
  operationToTool(id, { id, input: "void", output: "void", method: "m" }, () => undefined);

@suite
class InvokeTest extends McpFixtureTest {
  @test
  async runsServiceOperationWithArguments() {
    registerFixture();
    const { value, streamed } = await runOperation("Fixture.Echo", { session: new Session(), input: { text: "hi" } });
    assert.deepStrictEqual(value, { text: "hi" });
    assert.strictEqual(streamed, false);
  }

  @test
  async returnsScalarsAndVoid() {
    registerFixture();
    assert.deepStrictEqual(await runOperation("Fixture.Version", { session: new Session() }), {
      value: "1.2.3",
      streamed: false
    });
    assert.deepStrictEqual(await runOperation("Fixture.Noop", { session: new Session() }), {
      value: undefined,
      streamed: false
    });
  }

  @test
  async collectsStreamedChunksAndReportsThem() {
    registerFixture();
    const seen: Array<[unknown, number]> = [];
    const { value, streamed } = await runOperation("Fixture.Count", {
      session: new Session(),
      input: { n: 3 },
      onChunk: (chunk, index) => seen.push([chunk, index])
    });
    assert.strictEqual(streamed, true);
    assert.deepStrictEqual(value, [
      { index: 1, total: 3 },
      { index: 2, total: 3 },
      { index: 3, total: 3 }
    ]);
    assert.deepStrictEqual(
      seen.map(s => s[1]),
      [1, 2, 3]
    );
  }

  @test
  async privateFieldsNeverLeave() {
    registerFixture();
    const expected = { a: 1, n: { ok: 2 } };
    const plain = await runOperation("Fixture.Private", { session: new Session() });
    assert.deepStrictEqual(plain.value, expected);
    const seen: unknown[] = [];
    const streamed = await runOperation("Fixture.PrivateStream", {
      session: new Session(),
      onChunk: chunk => seen.push(chunk)
    });
    assert.deepStrictEqual(streamed.value, [expected]);
    assert.deepStrictEqual(seen, [expected]);
  }

  @test
  async cancellationStopsTheGenerator() {
    registerFixture();
    const controller = new AbortController();
    await assert.rejects(
      runOperation("Fixture.Count", {
        session: new Session(),
        input: { n: 100 },
        signal: controller.signal,
        onChunk: (_chunk, index) => index === 2 && controller.abort()
      }),
      CancelledError
    );
  }

  @test
  async enforcesPermission() {
    registerFixture();
    await assert.rejects(runOperation("Fixture.Secret", { session: new Session() }), /PermissionDenied/);
    const alice = new Session();
    alice.login("alice", "alice");
    assert.deepStrictEqual((await runOperation("Fixture.Secret", { session: alice })).value, { secret: 42 });
  }

  @test
  async validatesInput() {
    registerFixture();
    await assert.rejects(runOperation("Fixture.Echo", { session: new Session(), input: {} }), /InvalidInput/);
  }

  @test
  toolResultForObject() {
    const result = toToolResult(echoEntry(), { text: "hi" }, false, 1024);
    assert.deepStrictEqual(result, {
      content: [{ type: "text", text: '{"text":"hi"}' }],
      structuredContent: { text: "hi" }
    });
  }

  @test
  toolResultWrapsScalarsAndStreams() {
    assert.deepStrictEqual(toToolResult(plainEntry("Fixture.Version"), "1.2.3", false, 1024), {
      content: [{ type: "text", text: '{"value":"1.2.3"}' }],
      structuredContent: { value: "1.2.3" }
    });
    assert.deepStrictEqual(toToolResult(plainEntry("Fixture.Count"), [1, 2], true, 1024), {
      content: [{ type: "text", text: '{"items":[1,2]}' }],
      structuredContent: { items: [1, 2] }
    });
  }

  @test
  voidOutputHasNoStructuredContent() {
    const result = toToolResult(echoEntry(), undefined, false, 1024);
    assert.deepStrictEqual(result, { content: [{ type: "text", text: "" }] });
  }

  @test
  nonWebdaErrorsWithResponseCodeAreMasked() {
    // Duck-typed getResponseCode without getCode must not throw inside the handler
    const foreign = Object.assign(new Error("foreign"), { getResponseCode: () => 400 });
    assert.deepStrictEqual(errorToToolResult(foreign), {
      isError: true,
      content: [{ type: "text", text: "Internal error" }]
    });
  }

  @test
  truncateUtf8KeepsCharacterBoundaries() {
    assert.deepStrictEqual(truncateUtf8("abc", 3), { text: "abc", truncated: false, bytes: 3 });
    assert.deepStrictEqual(truncateUtf8("abcd", 3), { text: "abc", truncated: true, bytes: 4 });
    // "é" is two bytes: a 3-byte cut keeps one character, not one and a half
    assert.deepStrictEqual(truncateUtf8("\u00e9\u00e9", 3), { text: "\u00e9", truncated: true, bytes: 4 });
    // "€" is three bytes
    assert.deepStrictEqual(truncateUtf8("\u20ac\u20ac", 5), { text: "\u20ac", truncated: true, bytes: 6 });
    assert.deepStrictEqual(truncateUtf8("\u20ac", 2), { text: "", truncated: true, bytes: 3 });
  }

  @test
  toolResultTruncatesLargeOutput() {
    const result = toToolResult(echoEntry(), { text: "x".repeat(100) }, false, 32);
    assert.strictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent, undefined);
    const text = (result.content[0] as any).text as string;
    assert.ok(text.startsWith('{"text":"xxxxxxxxxxxxxxxxxxxxxx'));
    assert.ok(text.includes("[output truncated:"));
  }

  @test
  errorsBecomeToolResults() {
    assert.deepStrictEqual(errorToToolResult(new WebdaError.BadRequest("nope")), {
      isError: true,
      content: [{ type: "text", text: "BAD_REQUEST: nope" }]
    });
    assert.deepStrictEqual(errorToToolResult(new Error("secret db password")), {
      isError: true,
      content: [{ type: "text", text: "Internal error" }]
    });
    assert.deepStrictEqual(errorToToolResult(new CancelledError()), {
      isError: true,
      content: [{ type: "text", text: "Cancelled" }]
    });
  }

  @test
  async alreadyAbortedSignalIsCancelled() {
    registerFixture();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      runOperation("Fixture.Echo", { session: new Session(), input: { text: "hi" }, signal: controller.signal }),
      CancelledError
    );
  }

  @test
  toolResultTruncationKeepsUtf8Valid() {
    // {"text":"é...: the cut at an odd byte count falls inside a two-byte character
    const result = toToolResult(echoEntry(), { text: "é".repeat(50) }, false, 10);
    const text = (result.content[0] as any).text as string;
    assert.ok(!text.includes("\uFFFD"));
    assert.ok(text.includes("[output truncated:"));
  }
}
