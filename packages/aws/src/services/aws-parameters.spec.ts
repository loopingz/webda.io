import { SecretString } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { getAWSClientConfig } from "./aws-parameters.js";

@suite
class AWSParametersTest {
  @test
  plainCredentials() {
    const params = { region: "us-east-1", credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET" } };
    // Nothing to unwrap: the parameters are used as is
    assert.strictEqual(getAWSClientConfig(params), params);
    assert.strictEqual(getAWSClientConfig({ region: "us-east-1" }).region, "us-east-1");
  }

  @test
  secretCredentials() {
    const params = {
      region: "eu-west-1",
      endpoint: "http://localhost:4566",
      credentials: {
        accessKeyId: "KEY",
        secretAccessKey: new SecretString("SECRET", "test"),
        sessionToken: new SecretString("TOKEN", "test")
      }
    };
    const config = getAWSClientConfig(params);
    assert.deepStrictEqual(config, {
      region: "eu-west-1",
      endpoint: "http://localhost:4566",
      credentials: { accessKeyId: "KEY", secretAccessKey: "SECRET", sessionToken: "TOKEN" }
    });
    // The parameters keep the masked secrets
    assert.ok(params.credentials.secretAccessKey instanceof SecretString);
  }
}
