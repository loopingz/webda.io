import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { getKubernetesApiClient } from "./client";
import * as k8s from "@kubernetes/client-node";

/**
 * This is mainly for COV
 * We should inject true configuration to check more
 */
@suite
class GetKubernetesApiClient {
  @test
  withConfig() {
    assert.throws(
      () =>
        getKubernetesApiClient({
          config: "./test/kubeconfig"
        }),
      /Unknown format/
    );
    assert.throws(
      () =>
        getKubernetesApiClient({
          config: {}
        }),
      /No active cluster/
    );
  }

  @test
  withContext() {
    assert.throws(() => getKubernetesApiClient({ context: "plop" }, k8s.AppsV1Api), /No active cluster/);
  }
}
