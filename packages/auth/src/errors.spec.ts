import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as Errors from "./errors.js";

@suite
class ErrorsTest {
  @test
  codes() {
    const cases: [any, string, number][] = [
      [Errors.AccountExists, "ACCOUNT_EXISTS", 409],
      [Errors.IdentLinkedElsewhere, "IDENT_LINKED_ELSEWHERE", 409],
      [Errors.LastLoginMethod, "LAST_LOGIN_METHOD", 409],
      [Errors.InvalidCredentials, "INVALID_CREDENTIALS", 403],
      [Errors.RegistrationDisabled, "REGISTRATION_DISABLED", 403],
      [Errors.TokenExpired, "TOKEN_EXPIRED", 410],
      [Errors.Throttled, "THROTTLED", 429],
      [Errors.TokenInvalid, "TOKEN_INVALID", 403],
      [Errors.InvalidIdent, "INVALID_IDENT", 400],
      [Errors.UnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", 415]
    ];
    for (const [Cls, code, status] of cases) {
      const err = new Cls();
      assert.strictEqual(err.getCode(), code, Cls.name);
      assert.strictEqual(err.getResponseCode(), status, Cls.name);
    }
    assert.strictEqual(new Errors.PasswordPolicyError().getCode(), "PASSWORD_POLICY");
  }
}
