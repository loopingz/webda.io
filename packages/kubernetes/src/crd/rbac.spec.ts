import { suite, test } from "@webda/test";
import * as assert from "assert";
import { buildRbac } from "./rbac.js";

@suite
class RbacTest {
  @test
  roles() {
    const rule = { apiGroups: ["a.b"], resources: ["items"], verbs: ["get"] };
    const lease = { apiGroups: ["coordination.k8s.io"], resources: ["leases"], verbs: ["get"] };
    const manifests = buildRbac(
      [{ namespace: "apps", rule }, { namespace: "apps", rule }, { namespace: "apps", rule: lease }, { rule }],
      { name: "webda", serviceAccount: "api", serviceAccountNamespace: "apps" }
    );
    assert.deepStrictEqual(
      manifests.map(m => `${m.kind}/${m.metadata.namespace ?? ""}`),
      ["ClusterRole/", "ClusterRoleBinding/", "Role/apps", "RoleBinding/apps"]
    );
    // Identical rules are merged
    assert.deepStrictEqual(manifests[2].rules, [rule, lease]);
    assert.deepStrictEqual(manifests[3].roleRef, {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "Role",
      name: "webda"
    });
    assert.deepStrictEqual(manifests[1].subjects, [{ kind: "ServiceAccount", name: "api", namespace: "apps" }]);
    assert.deepStrictEqual(buildRbac([], { name: "w", serviceAccount: "s", serviceAccountNamespace: "n" }), []);
  }
}
