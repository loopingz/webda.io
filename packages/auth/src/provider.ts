import { type ProviderInfo, type Service, useDynamicService } from "@webda/core";
import type { Authentication } from "./authentication.service.js";

/** A login method plugged into {@link Authentication} */
export interface AuthProvider extends Service {
  /** Unique provider name, used in ident keys ("email", "google") */
  readonly providerName: string;
  /**
   * @returns what clients see in Auth.Providers
   */
  getPublicInfo(): ProviderInfo;
}

/**
 * @param service - any service
 * @returns true when it implements AuthProvider
 */
export function isAuthProvider(service: any): service is AuthProvider {
  return !!service && typeof service.providerName === "string" && typeof service.getPublicInfo === "function";
}

/**
 * @returns the Authentication service
 */
export function useAuthentication(): Authentication {
  return useDynamicService<Authentication>("Authentication");
}
