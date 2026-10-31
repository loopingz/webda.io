import { createChecker } from "is-in-subnet";

/**
 * Create a matcher for a list of CIDRs
 *
 * A bare IP address is read as a /32 network.
 * @param cidrs - the CIDRs or IP addresses
 * @returns a function telling if an IP address belongs to one of the networks
 */
export function createSubnetChecker(cidrs: string[]): (ip: string) => boolean {
  return createChecker(cidrs.map(n => (n.indexOf("/") < 0 ? `${n.trim()}/32` : n.trim())));
}
