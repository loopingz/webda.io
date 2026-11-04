/** Minimal deployer contract given to contributors, without importing a concrete Azure deployer. */
export interface AzureDeployerInfo {
  /** Resolved deployment scope and location; other deployer parameters can coexist. */
  resources: {
    resourceGroup: string;
    location: string;
    subscriptionId: string;
  };
  /**
   * Merge deployment tags and resource-specific tags.
   * @param tags - resource-specific tags
   * @returns merged resource tags
   */
  getDefaultTags(tags?: Record<string, string>): Record<string, string>;
  /** @returns ARM expression identifying the application's managed identity principal */
  getAppPrincipalId(): string;
}

/** A role that the deployer must grant to the application's managed identity, at the given resource scope. */
export interface AzureRoleAssignment {
  /** Role definition resource identifier or ARM expression. */
  roleDefinitionId: string;
  /** Resource scope identifier or ARM expression. */
  scope: string;
}

/** ARM resources and runtime settings contributed by one application service. */
export interface AzureResourceContribution {
  /** ARM resource declarations. */
  resources?: Record<string, unknown>[];
  /** Variables for the application and jobs; secret values are references, rather than inline secrets. */
  env?: Record<string, string | { secretRef: string }>;
  /** ARM template outputs. */
  outputs?: Record<string, unknown>;
  /** Roles granted to the application's managed identity by the deployer. */
  roleAssignments?: AzureRoleAssignment[];
}

/** Allow a service to contribute to an Azure deployment template without depending on its implementation. */
export interface AzureContributor {
  /**
   * Describe resources, settings and managed-identity roles, without deploying them.
   * @param deployer - current deployment scope and template helpers
   * @returns contribution merged by the deployer
   */
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution;
}
