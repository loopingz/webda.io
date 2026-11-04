import type { AccessToken, TokenCredential } from "@azure/core-auth";
import { WebdaError } from "@webda/core";
import { AzureServiceParameters, getAzureCredential } from "./services/azure-parameters.js";

/** Azure authentication shared by ARM deployment, ACR publishing and OneDeploy. */
export class AzureAuth {
  protected credential?: TokenCredential;
  protected armToken?: AccessToken;
  /**
   * Initialize the Azure integration.
   * @param parameters - Azure authentication or integration parameters
   */
  constructor(protected parameters: AzureServiceParameters) {}

  /**
   * Return the shared Azure SDK credential.
   * @returns Credential shared by Azure SDK clients
   */
  getCredential(): TokenCredential {
    return (this.credential ??= getAzureCredential(this.parameters));
  }

  /**
   * Acquire or reuse an ARM access token.
   * @returns Access token for ARM requests
   */
  async getArmToken(): Promise<string> {
    try {
      if (!this.armToken || this.armToken.expiresOnTimestamp < Date.now() + 60000) {
        this.armToken = (await this.getCredential().getToken("https://management.azure.com/.default")) ?? undefined;
      }
      if (!this.armToken) throw new Error();
      return this.armToken.token;
    } catch {
      throw new WebdaError.CodeError(
        "AZURE_AUTH",
        "Azure authentication failed: run az login or configure AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_CLIENT_SECRET"
      );
    }
  }

  /**
   * Exchange an ARM token for an ACR refresh token.
   * @param loginServer - ACR login server hostname
   * @returns ACR refresh token
   */
  async getAcrRefreshToken(loginServer: string): Promise<string> {
    if (!/^[a-zA-Z0-9-]+\.azurecr\.(?:io|cn|us)$/.test(loginServer))
      throw new WebdaError.BadRequest("ACR token exchange requires an Azure Container Registry login server");
    const body = new URLSearchParams({
      grant_type: "access_token",
      service: loginServer,
      access_token: await this.getArmToken()
    });
    if (this.parameters.tenantId) body.set("tenant", this.parameters.tenantId);
    try {
      const response = await fetch(`https://${loginServer}/oauth2/exchange`, {
        method: "POST",
        body,
        redirect: "error",
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { refresh_token?: string };
      if (!result.refresh_token) throw new Error();
      return result.refresh_token;
    } catch {
      throw new WebdaError.CodeError(
        "AZURE_ACR_AUTH",
        "ACR token exchange failed; check the identity's registry push permissions"
      );
    }
  }
}
