import { WebdaTest } from "@webda/core/lib/test";
import * as fetch from "node-fetch";

export class WebdaGcpTest extends WebdaTest {
  async before() {
    await super.before();
  }
}
