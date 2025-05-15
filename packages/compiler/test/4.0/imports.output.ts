import { Core, ServiceParameters, ModelClass as CoreModelDefinition } from "@webda/core";
import { suite, test } from "@webda/test";
import { other, DeepPartial } from "@webda/tsc-esm";
import { ModelClass } from "fake";
import { FileUtils, WaitFor } from "@webda/utils";
import * as WebdaQL from "@webda/ql";
import { WebdaApplicationTest } from "@webda/core/lib/test/test";

class Test extends CoreModelDefinition {
  test() {
    let CoreModelDefinition = "";
  }
}
