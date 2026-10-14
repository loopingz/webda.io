import { useDynamicService } from "@webda/core";
import type { OIDCClient } from "./client.service.js";
import type { OIDCIssuer } from "./issuer.service.js";
import type { OIDCVerifier } from "./verifier.service.js";

/**
 * @param name - the service name
 * @returns the OIDC client
 */
export function useOIDCClient(name: string = "OIDCClient"): OIDCClient {
  return useDynamicService<OIDCClient>(name);
}

/**
 * @param name - the service name
 * @returns the OIDC verifier
 */
export function useOIDCVerifier(name: string = "OIDCVerifier"): OIDCVerifier {
  return useDynamicService<OIDCVerifier>(name);
}

/**
 * @param name - the service name
 * @returns the OIDC issuer
 */
export function useOIDCIssuer(name: string = "OIDCIssuer"): OIDCIssuer {
  return useDynamicService<OIDCIssuer>(name);
}
