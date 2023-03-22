import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { DomainService } from "./domainservice";

@suite
class DomainServiceTest extends WebdaTest {
  getTestConfiguration2(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }
  @test
  async test() {
    await this.registerService(new DomainService(this.webda, "DomainService")).resolve().init();
  }
}
