import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { User } from "./user";

@suite
class UserTest {
  @test("Verify groups in user") groupManagement() {
    let user: User = new User();
    user.addGroup("test");
    assert.equal(user.inGroup("test"), true);
    user.addGroup("test");
    assert.equal(user.inGroup("test"), true);
    user.removeGroup("test");
    assert.equal(user.inGroup("test"), false);
    assert.equal(user.inGroup("all"), true);
    user.removeGroup("unknown");
  }

  @test("Verify roles in user") roleManagement() {
    let user: User = new User();
    user.addRole("test");
    assert.equal(user.hasRole("test"), true);
    user.addRole("test");
    assert.equal(user.hasRole("test"), true);
    user.removeRole("test");
    assert.equal(user.hasRole("test"), false);
    user.removeRole("unknown");
  }

  @test
  password() {
    let user: User = new User();
    user.setPassword("bouzouf");
  }
}
