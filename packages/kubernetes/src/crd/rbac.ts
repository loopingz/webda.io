/**
 * A rule of a Role or ClusterRole
 */
export interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

/**
 * Rights a service needs: in a namespace, or cluster wide
 */
export interface RbacGrant {
  /**
   * Namespace of the rights, undefined for cluster wide rights
   */
  namespace?: string;
  rule: PolicyRule;
}

/**
 * Subject and names of the generated objects
 */
export interface RbacOptions {
  /**
   * Name of the Roles, ClusterRole and their bindings
   */
  name: string;
  /**
   * Service account running the application
   */
  serviceAccount: string;
  /**
   * Namespace of the service account
   */
  serviceAccountNamespace: string;
}

/**
 * Build the Roles (one per namespace), the ClusterRole and their bindings granting the rights to a service account
 *
 * Identical rules are merged.
 * @param grants - the rights
 * @param options - names and subject
 * @returns the RBAC manifests
 */
export function buildRbac(grants: RbacGrant[], options: RbacOptions): any[] {
  const byScope = new Map<string | undefined, PolicyRule[]>();
  for (const { namespace, rule } of grants) {
    const rules = byScope.get(namespace) ?? [];
    if (!rules.some(r => JSON.stringify(r) === JSON.stringify(rule))) rules.push(rule);
    byScope.set(namespace, rules);
  }
  const subjects = [
    { kind: "ServiceAccount", name: options.serviceAccount, namespace: options.serviceAccountNamespace }
  ];
  const manifests: any[] = [];
  // Cluster wide first, then the namespaces in order (sort never compares undefined)
  const namespaces = [...byScope.keys()].filter(n => n !== undefined).sort();
  const scopes = byScope.has(undefined) ? [undefined, ...namespaces] : namespaces;
  for (const namespace of scopes) {
    const kind = namespace === undefined ? "ClusterRole" : "Role";
    const metadata = { name: options.name, ...(namespace !== undefined ? { namespace } : {}) };
    manifests.push(
      { apiVersion: "rbac.authorization.k8s.io/v1", kind, metadata, rules: byScope.get(namespace) },
      {
        apiVersion: "rbac.authorization.k8s.io/v1",
        kind: `${kind}Binding`,
        metadata,
        roleRef: { apiGroup: "rbac.authorization.k8s.io", kind, name: options.name },
        subjects
      }
    );
  }
  return manifests;
}
