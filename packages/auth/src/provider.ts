import { type ProviderInfo, type ResolvedIdentity, type Service, useDynamicService } from "@webda/core";
import type { Authentication } from "./authentication.service.js";
import { EmailDomainNotAllowed } from "./errors.js";

/** A login method plugged into {@link Authentication} */
export interface AuthProvider extends Service {
  /** Unique provider name, used in ident keys ("email", "google") */
  readonly providerName: string;
  /**
   * @returns what clients see in Auth.Providers
   */
  getPublicInfo(): ProviderInfo;
  /**
   * Email rules of this provider; when absent, Authentication reads the provider service parameters
   * @returns the email policy
   */
  getEmailPolicy?(): ProviderEmailPolicy;
}

/** Per-provider rules on asserted emails; read from the provider service parameters */
export interface ProviderEmailPolicy {
  /**
   * Only identities whose email domain is listed may log in (case-insensitive, exact domain match, no wildcard).
   * The email must also be verified and trusted (see trustEmailVerification). An empty list refuses everyone.
   * Undefined means all domains.
   */
  allowedEmailDomains?: string[];
  /**
   * Whether the provider's emailVerified claim is believed: true (default) = all domains, false = never,
   * string[] = only these domains.
   */
  trustEmailVerification?: boolean | string[];
}

/**
 * @param email - an email address
 * @returns the lowercased part after the last "@", undefined if none
 */
export function emailDomain(email: string): string | undefined {
  const idx = email.lastIndexOf("@");
  return idx < 0
    ? undefined
    : email
        .substring(idx + 1)
        .trim()
        .toLowerCase();
}

/**
 * Apply a provider email policy to a resolved identity without mutating it
 * @param identity - identity asserted by the provider
 * @param policy - the provider policy, if any
 * @returns the identity to use (a copy with emailVerified forced to false when the claim is not trusted)
 * @throws EmailDomainNotAllowed when the email is missing or its domain is not allowed
 */
export function applyEmailPolicy(
  identity: ResolvedIdentity,
  policy: ProviderEmailPolicy | undefined
): ResolvedIdentity {
  if (!policy) return identity;
  const domain = identity.email ? emailDomain(identity.email) : undefined;
  const norm = (list: string[]) => list.map(d => d.trim().toLowerCase());
  const trust = policy.trustEmailVerification;
  let out = identity;
  if (identity.emailVerified && trust !== undefined && trust !== true) {
    if (trust === false || !domain || !norm(trust).includes(domain)) {
      out = { ...identity, emailVerified: false };
    }
  }
  // The allow-list only admits a present, listed and (still) verified email
  if (
    policy.allowedEmailDomains &&
    (!domain || !out.emailVerified || !norm(policy.allowedEmailDomains).includes(domain))
  ) {
    throw new EmailDomainNotAllowed();
  }
  return out;
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
