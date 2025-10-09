import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as WebdaError from "./errors.js";

@suite
class ErrorsTest {
  @test
  cov() {
    assert.strictEqual(new WebdaError.BadRequest("test").getResponseCode(), 400);
    assert.strictEqual(new WebdaError.CodeError("PLOP", "test").getResponseCode(), 500);
    assert.strictEqual(new WebdaError.CodeError("PLOP", "test").getCode(), "PLOP");
    assert.throws(() => {
      throw new WebdaError.BadRequest("test");
    });
    assert.throws(() => {
      throw new WebdaError.NotImplemented("test");
    });
    assert.throws(() => {
      throw new WebdaError.ServiceUnavailable("test");
    });
    assert.strictEqual(new WebdaError.HttpError("test").code, "HTTP_ERROR");
    new WebdaError.Redirect("test", "http://test.com");
    // http error codes
    const codes = {
      Unauthorized: 401,
      Forbidden: 403,
      NotFound: 404,
      Conflict: 409,
      NotImplemented: 501,
      ServiceUnavailable: 503,
      BadRequest: 400,
      TooManyRequests: 429,
      Gone: 410,
      PreconditionFailed: 412
    };
    for (const code in codes) {
      // @ts-ignore
      const err = new WebdaError[code]("test");
      // @ts-ignore
      assert.strictEqual(err.getResponseCode(), codes[code]);
    }
  }
}
