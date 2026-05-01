import { suite, test } from "@webda/test";
import * as assert from "assert";
import { captureBody, hexPreview, isTextContentType, looksLikeText, normalizeHeaders } from "./bodycapture.js";

@suite
class IsTextContentTypeTest {
  @test
  detectsApplicationJson() {
    assert.strictEqual(isTextContentType("application/json"), true);
    assert.strictEqual(isTextContentType("application/json; charset=utf-8"), true);
  }

  @test
  detectsTextStarTypes() {
    assert.strictEqual(isTextContentType("text/plain"), true);
    assert.strictEqual(isTextContentType("text/html; charset=UTF-8"), true);
    assert.strictEqual(isTextContentType("text/css"), true);
  }

  @test
  detectsFormUrlencoded() {
    assert.strictEqual(isTextContentType("application/x-www-form-urlencoded"), true);
  }

  @test
  detectsXmlAndJsonSuffix() {
    assert.strictEqual(isTextContentType("application/xml"), true);
    assert.strictEqual(isTextContentType("application/vnd.foo+json"), true);
    assert.strictEqual(isTextContentType("application/vnd.foo+xml"), true);
  }

  @test
  detectsJavascript() {
    assert.strictEqual(isTextContentType("application/javascript"), true);
    assert.strictEqual(isTextContentType("application/ecmascript"), true);
  }

  @test
  rejectsBinaryTypes() {
    assert.strictEqual(isTextContentType("application/octet-stream"), false);
    assert.strictEqual(isTextContentType("image/png"), false);
    assert.strictEqual(isTextContentType("application/pdf"), false);
    assert.strictEqual(isTextContentType("video/mp4"), false);
  }

  @test
  rejectsUndefinedAndEmpty() {
    assert.strictEqual(isTextContentType(undefined), false);
    assert.strictEqual(isTextContentType(""), false);
  }
}

@suite
class LooksLikeTextTest {
  @test
  emptyBufferIsText() {
    assert.strictEqual(looksLikeText(Buffer.alloc(0)), true);
  }

  @test
  asciiTextIsText() {
    assert.strictEqual(looksLikeText(Buffer.from("Hello, world!\n")), true);
  }

  @test
  jsonShapedIsText() {
    assert.strictEqual(looksLikeText(Buffer.from('{"foo": "bar"}')), true);
  }

  @test
  bufferWithNullByteIsBinary() {
    assert.strictEqual(looksLikeText(Buffer.from([0x68, 0x69, 0x00, 0x00])), false);
  }

  @test
  pngHeaderIsBinary() {
    // PNG starts with 0x89 0x50 0x4e 0x47 — 0x89 is high-bit but not a UTF-8 lead
    assert.strictEqual(looksLikeText(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
  }

  @test
  utf8MultibyteIsText() {
    assert.strictEqual(looksLikeText(Buffer.from("héllo", "utf8")), true);
  }
}

@suite
class HexPreviewTest {
  @test
  pngHeaderHexPreview() {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    assert.strictEqual(hexPreview(buf, 4), "89504e47");
  }

  @test
  preview2BytesOfShortBuffer() {
    const buf = Buffer.from([0xff, 0xd8]);
    assert.strictEqual(hexPreview(buf, 4), "ffd8");
  }

  @test
  emptyBufferGivesEmptyPreview() {
    assert.strictEqual(hexPreview(Buffer.alloc(0), 4), "");
  }

  @test
  zeroCountGivesEmptyPreview() {
    assert.strictEqual(hexPreview(Buffer.from([0x01, 0x02]), 0), "");
  }
}

@suite
class CaptureBodyTest {
  @test
  emptyBufferReturnsEmptyKind() {
    const result = captureBody(Buffer.alloc(0), "application/json", 1024, 4);
    assert.deepStrictEqual(result, { kind: "empty" });
  }

  @test
  textBodyWithinLimit() {
    const payload = '{"foo":"bar"}';
    const result = captureBody(Buffer.from(payload), "application/json", 1024, 4);
    assert.deepStrictEqual(result, { kind: "text", content: payload, size: payload.length });
  }

  @test
  textBodyOverLimitIsTruncated() {
    const payload = "a".repeat(2048);
    const result = captureBody(Buffer.from(payload), "text/plain", 1024, 4);
    assert.strictEqual(result.kind, "text-truncated");
    if (result.kind === "text-truncated") {
      assert.strictEqual(result.content.length, 1024);
      assert.strictEqual(result.size, 2048);
      assert.strictEqual(result.content, "a".repeat(1024));
    }
  }

  @test
  binaryBodyWithHexPreview() {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = captureBody(buf, "image/png", 1024, 4);
    assert.deepStrictEqual(result, { kind: "binary", size: 8, preview: "89504e47" });
  }

  @test
  octetStreamIsBinary() {
    const buf = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]);
    const result = captureBody(buf, "application/octet-stream", 1024, 4);
    assert.strictEqual(result.kind, "binary");
    if (result.kind === "binary") {
      assert.strictEqual(result.size, 4);
      assert.strictEqual(result.preview, "fffefdfc");
    }
  }

  @test
  missingContentTypeWithTextSniffsAsText() {
    const payload = "Hello, world!";
    const result = captureBody(Buffer.from(payload), undefined, 1024, 4);
    assert.deepStrictEqual(result, { kind: "text", content: payload, size: payload.length });
  }

  @test
  missingContentTypeWithBinarySniffsAsBinary() {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const result = captureBody(buf, undefined, 1024, 4);
    assert.strictEqual(result.kind, "binary");
  }

  @test
  binaryPreviewByteCountIsRespected() {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const result = captureBody(buf, "image/png", 1024, 2);
    if (result.kind === "binary") {
      assert.strictEqual(result.preview, "8950");
    } else {
      assert.fail("expected binary kind");
    }
  }
}

@suite
class NormalizeHeadersTest {
  @test
  undefinedReturnsEmptyObject() {
    assert.deepStrictEqual(normalizeHeaders(undefined), {});
  }

  @test
  stringValuesArePreserved() {
    const result = normalizeHeaders({ "content-type": "application/json", "x-foo": "bar" });
    assert.deepStrictEqual(result, { "content-type": "application/json", "x-foo": "bar" });
  }

  @test
  arrayValuesAreJoined() {
    const result = normalizeHeaders({ "set-cookie": ["a=1", "b=2"] });
    assert.deepStrictEqual(result, { "set-cookie": "a=1, b=2" });
  }

  @test
  numericValuesAreCoerced() {
    const result = normalizeHeaders({ "content-length": 42 });
    assert.deepStrictEqual(result, { "content-length": "42" });
  }

  @test
  undefinedAndNullValuesAreDropped() {
    const result = normalizeHeaders({ a: undefined, b: null as any, c: "ok" });
    assert.deepStrictEqual(result, { c: "ok" });
  }
}
