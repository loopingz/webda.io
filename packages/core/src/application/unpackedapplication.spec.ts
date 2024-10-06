import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "./test";
import { UnpackedApplication } from "./unpackedapplication";

@suite
class UnpackedApplicationTest extends WebdaTest {
  @test
  cachedModule() {
    new UnpackedApplication("./test/config-cached.json");
  }
}
