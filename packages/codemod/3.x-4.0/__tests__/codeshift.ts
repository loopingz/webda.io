import { Core, FileUtils, ServiceParameters, WebdaQL } from "@webda/core";
import { suite, test } from "@testdeck/mocha";
import { other } from "@webda/tsc-esm";
import { DeepPartial } from "@webda/core";

class MyParameters extends ServiceParameters {
  prefix?: string;
  bucket: string;

  constructor(params: MyParameters) {
    super(params);
    this.prefix = params.prefix;
    this.bucket = params.bucket;
  }
}

class MyService extends Service {
  loadParameters(params: MyParameters) {
    return new MyParameters(params);
  }
}
