import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as k8s from "@kubernetes/client-node";
import { createServer } from "node:http";
import { FAKE_KUBECONFIG } from "../../test/fixture.js";
import { getKubeConfig, getKubernetesApiClient } from "./client.js";

/**
 * This is mainly for COV
 * We should inject true configuration to check more
 */
@suite
class GetKubernetesApiClientTest {
  @test
  withConfig() {
    assert.throws(() => getKubernetesApiClient({ config: "./test/kubeconfig" }), /Unknown format/);
    assert.throws(() => getKubernetesApiClient(<any>{ config: {} }), /No active cluster/);
    assert.ok(getKubernetesApiClient(<any>{ config: FAKE_KUBECONFIG }) instanceof k8s.KubernetesObjectApi);
    assert.ok(getKubernetesApiClient(<any>{ config: FAKE_KUBECONFIG }, k8s.AppsV1Api) instanceof k8s.AppsV1Api);
  }

  @test
  withContext() {
    // Ensure the developer kubeconfig is not used
    const env = { HOME: process.env.HOME, KUBECONFIG: process.env.KUBECONFIG };
    try {
      process.env.HOME = "/nonexistent";
      delete process.env.KUBECONFIG;
      assert.throws(() => getKubernetesApiClient({ context: "plop" }, k8s.AppsV1Api), /No active cluster/);
    } finally {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
    assert.strictEqual(
      getKubeConfig(<any>{ config: { ...FAKE_KUBECONFIG, currentContext: "" }, context: "fake" }).getCurrentContext(),
      "fake"
    );
  }

  @test
  async withTimeout() {
    // A server that never answers
    const server = createServer(() => {});
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = <any>server.address();
      const config = {
        ...FAKE_KUBECONFIG,
        clusters: [{ name: "fake", server: `http://127.0.0.1:${port}`, skipTLSVerify: true }]
      };
      const start = Date.now();
      await assert.rejects(
        getKubernetesApiClient(<any>{ config, timeout: 100 }, k8s.CoreV1Api).listNamespace(),
        /abort|timeout/i
      );
      assert.ok(Date.now() - start < 5000);
      const objects = getKubernetesApiClient(<any>{ config, timeout: 100, context: "fake" });
      assert.ok(objects instanceof k8s.KubernetesObjectApi);
      await assert.rejects(objects.list("v1", "Namespace"), /abort|timeout/i);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }
}
