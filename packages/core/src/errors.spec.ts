import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as WebdaError from "./errors";

@suite
class ErrorsTest {
  @test
  cov() {
    assert.strictEqual(new WebdaError.BadRequest("test").getResponseCode(), 400);
    assert.strictEqual(new WebdaError.CodeError("PLOP", "test").getResponseCode(), 500);
    assert.rejects(() => {
      throw new WebdaError.BadRequest("test");
    });
    assert.rejects(() => {
      throw new WebdaError.NotImplemented("test");
    });
    assert.rejects(() => {
      throw new WebdaError.ServiceUnavailable("test");
    });
    assert.strictEqual(new WebdaError.HttpError("test").code, "HTTP_ERROR");
    new WebdaError.Redirect("test", "http://test.com");
  }
}
