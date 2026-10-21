import * as k8s from "@kubernetes/client-node";

/**
 * A custom resource as read from the API server
 */
export interface CustomResource {
  apiVersion: string;
  kind: string;
  metadata: k8s.V1ObjectMeta & { name: string };
  spec?: any;
  status?: any;
}

/**
 * Type of the custom resources of a repository
 */
export interface CustomResourceType {
  group: string;
  version: string;
  plural: string;
  kind: string;
  /**
   * Namespace of the resources, undefined for cluster scoped resources
   */
  namespace?: string;
}

/**
 * Whether an error is an API error with this status code
 * @param err - the error
 * @param code - the HTTP status code
 * @returns true if it is
 */
export function isApiStatus(err: unknown, code: number): boolean {
  return err instanceof k8s.ApiException && err.code === code;
}

/**
 * CRUD on the custom resources of one type, namespaced or cluster scoped
 */
export class CustomResources {
  /**
   * @param api - the custom objects API
   * @param type - the resources type
   */
  constructor(
    protected api: k8s.CustomObjectsApi,
    readonly type: CustomResourceType
  ) {}

  /**
   * @returns `group/version`
   */
  get apiVersion(): string {
    return `${this.type.group}/${this.type.version}`;
  }

  /**
   * Common parameters of the requests
   * @returns group, version, plural and namespace when namespaced
   */
  protected params(): { group: string; version: string; plural: string; namespace: string } {
    const { group, version, plural, namespace } = this.type;
    return { group, version, plural, namespace: namespace! };
  }

  /**
   * Get a resource
   * @param name - the name
   * @returns the resource
   * @throws ApiException 404 when not found
   */
  async get(name: string): Promise<CustomResource> {
    return this.type.namespace
      ? this.api.getNamespacedCustomObject({ ...this.params(), name })
      : this.api.getClusterCustomObject({ ...this.params(), name });
  }

  /**
   * List one page of resources
   * @param options - the list options
   * @param options.labelSelector - only the resources matching it
   * @param options.limit - page size
   * @param options._continue - continue token of the previous page
   * @returns the resources and the continue token of the next page
   */
  async list(options: { labelSelector?: string; limit?: number; _continue?: string } = {}): Promise<{
    items: CustomResource[];
    metadata?: { continue?: string };
  }> {
    return this.type.namespace
      ? this.api.listNamespacedCustomObject({ ...this.params(), ...options })
      : this.api.listClusterCustomObject({ ...this.params(), ...options });
  }

  /**
   * List every resource, page by page
   * @param labelSelector - only the resources matching it
   * @param pageSize - resources per request
   * @returns the resources
   */
  async listAll(labelSelector?: string, pageSize: number = 500): Promise<CustomResource[]> {
    const items: CustomResource[] = [];
    let _continue: string | undefined;
    do {
      const page = await this.list({ labelSelector, limit: pageSize, _continue });
      items.push(...page.items);
      _continue = page.metadata?.continue || undefined;
    } while (_continue);
    return items;
  }

  /**
   * Create a resource
   * @param body - the resource
   * @returns the created resource
   * @throws ApiException 409 when it exists
   */
  async create(body: CustomResource): Promise<CustomResource> {
    return this.type.namespace
      ? this.api.createNamespacedCustomObject({ ...this.params(), body })
      : this.api.createClusterCustomObject({ ...this.params(), body });
  }

  /**
   * Replace a resource, but its status
   * @param body - the resource, with the resourceVersion it was read with
   * @returns the replaced resource
   * @throws ApiException 409 when the resourceVersion is outdated
   */
  async replace(body: CustomResource): Promise<CustomResource> {
    const name = body.metadata.name;
    return this.type.namespace
      ? this.api.replaceNamespacedCustomObject({ ...this.params(), name, body })
      : this.api.replaceClusterCustomObject({ ...this.params(), name, body });
  }

  /**
   * Replace the status of a resource
   * @param body - the resource, with the resourceVersion it was read with
   * @returns the replaced resource
   * @throws ApiException 409 when the resourceVersion is outdated
   */
  async replaceStatus(body: CustomResource): Promise<CustomResource> {
    const name = body.metadata.name;
    return this.type.namespace
      ? this.api.replaceNamespacedCustomObjectStatus({ ...this.params(), name, body })
      : this.api.replaceClusterCustomObjectStatus({ ...this.params(), name, body });
  }

  /**
   * Delete a resource
   * @param name - the name
   * @param resourceVersion - only delete this version of the resource
   * @throws ApiException 404 when not found, 409 when the version changed
   */
  async delete(name: string, resourceVersion?: string): Promise<void> {
    const body: k8s.V1DeleteOptions | undefined = resourceVersion ? { preconditions: { resourceVersion } } : undefined;
    await (this.type.namespace
      ? this.api.deleteNamespacedCustomObject({ ...this.params(), name, body })
      : this.api.deleteClusterCustomObject({ ...this.params(), name, body }));
  }
}
