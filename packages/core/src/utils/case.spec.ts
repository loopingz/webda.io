import { suite, test } from "../test/core";
import assert from "assert";
import { TransformCase, TransformCaseType } from "./case";

@suite
class CaseTest {
  @test
  transformName() {
    let t: TransformCaseType = "camelCase";
    assert.strictEqual(TransformCase("Users", t), "users");
    assert.strictEqual(TransformCase("Users_Test", t), "usersTest");
    assert.strictEqual(TransformCase("UsersTest", t), "usersTest");
    t = "lowercase";
    assert.strictEqual(TransformCase("Users", t), "users");
    assert.strictEqual(TransformCase("Users_Test", t), "users_test");
    assert.strictEqual(TransformCase("UsersTest", t), "userstest");
    t = "none";
    assert.strictEqual(TransformCase("Users", t), "Users");
    assert.strictEqual(TransformCase("Users_Test", t), "Users_Test");
    assert.strictEqual(TransformCase("UsersTest", t), "UsersTest");
    t = "snake_case";
    assert.strictEqual(TransformCase("Users", t), "users");
    assert.strictEqual(TransformCase("Users_Test", t), "users_test");
    assert.strictEqual(TransformCase("Users-Test", t), "users_test");
    assert.strictEqual(TransformCase("UsersTest", t), "users_test");
    assert.strictEqual(TransformCase("U_Test", t), "u_test");
    t = "PascalCase";
    assert.strictEqual(TransformCase("users", t), "Users");
    assert.strictEqual(TransformCase("users_test", t), "UsersTest");
    assert.strictEqual(TransformCase("UsersTest", t), "UsersTest");
    t = "kebab-case";
    assert.strictEqual(TransformCase("Users", t), "users");
    assert.strictEqual(TransformCase("Users_Test", t), "users-test");
    assert.strictEqual(TransformCase("UsersTest", t), "users-test");
    t = "ENV_VAR";
    assert.strictEqual(TransformCase("Users", t), "USERS");
    assert.strictEqual(TransformCase("Users_Test", t), "USERS_TEST");
    assert.strictEqual(TransformCase("UsersTest", t), "USERS_TEST");
  }
}
