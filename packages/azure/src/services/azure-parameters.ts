import { ClientSecretCredential, DefaultAzureCredential } from "@azure/identity";
import type { TokenCredential } from "@azure/core-auth";
import { SecretString, ServiceParameters } from "@webda/core";

/** Authentication and endpoint parameters shared by Azure services and deployers. */
export interface AzureServiceParameters {
  /** Microsoft Entra tenant; defaults to AZURE_TENANT_ID. */
  tenantId?: string;
  /** Service principal or user-assigned managed identity client id; defaults to AZURE_CLIENT_ID. */
  clientId?: string;
  /** Service principal secret; defaults to AZURE_CLIENT_SECRET. Prefer managed/workload identity. */
  clientSecret?: string | SecretString;
  /** Subscription containing the resources; defaults to AZURE_SUBSCRIPTION_ID. */
  subscriptionId?: string;
  /** Service-specific endpoint override, for example Azurite. This is not an identity authority URL. */
  endpoint?: string;
}

/** Common parameters for services using Microsoft Entra authentication. */
export class AzureParameters extends ServiceParameters implements AzureServiceParameters {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string | SecretString;
  subscriptionId?: string;
  endpoint?: string;

  /**
   * Apply the standard Azure environment defaults.
   * @override
   */
  load(params: Partial<AzureParameters> = {}): this {
    super.load(params);
    return loadAzureParameters(this);
  }
}

/**
 * Fill absent Azure parameters from the standard Azure environment variables. Explicit values always win. Service parameter classes can call this from load(); it preserves SecretString instances.
 * @param params - Raw configuration parameters
 * @returns The load azure parameters result
 */
export function loadAzureParameters<T extends AzureServiceParameters>(params: T): T {
  params.tenantId ??= process.env.AZURE_TENANT_ID || undefined;
  params.clientId ??= process.env.AZURE_CLIENT_ID || undefined;
  params.clientSecret ??= process.env.AZURE_CLIENT_SECRET || undefined;
  params.subscriptionId ??= process.env.AZURE_SUBSCRIPTION_ID || undefined;
  return params;
}

/**
 * Select a service principal when all three credential fields are nonempty, otherwise use Azure's default chain. Constructing the credential performs no network I/O. Secrets are unwrapped only for the SDK constructor and clear-text values produce SecretString's value-free warning. The input and process environment are unchanged.
 * @param params - Raw configuration parameters
 * @returns The azure credential result
 */
export function getAzureCredential(params: AzureServiceParameters = {}): TokenCredential {
  const resolved = loadAzureParameters({ ...params });
  const secret =
    resolved.clientSecret === undefined ? undefined : SecretString.from(resolved.clientSecret, "clientSecret");
  if (resolved.tenantId && resolved.clientId && secret) {
    return new ClientSecretCredential(resolved.tenantId, resolved.clientId, secret);
  }
  return new DefaultAzureCredential({
    tenantId: resolved.tenantId || undefined,
    managedIdentityClientId: resolved.clientId || undefined,
    workloadIdentityClientId: resolved.clientId || undefined
  });
}
