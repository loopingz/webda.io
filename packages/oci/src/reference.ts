/**
 * Registry host of Docker Hub, as written in image references
 */
export const DOCKER_HUB = "docker.io";
/**
 * Host serving the Docker Hub registry API
 */
export const DOCKER_HUB_API = "registry-1.docker.io";

/**
 * A parsed image reference: `[registry/]repository[:tag][@digest]`
 */
export interface ImageReference {
  /**
   * Registry host, with its port, `docker.io` for Docker Hub
   */
  registry: string;
  /**
   * Repository within the registry, `library/node` for the official images
   */
  repository: string;
  /**
   * Tag, undefined when a digest is given without a tag
   */
  tag?: string;
  /**
   * Digest, `sha256:...`
   */
  digest?: string;
}

/**
 * Parse an image reference like Docker does
 *
 * The first path component is a registry when it contains a `.` or a `:`, or is `localhost`.
 * Docker Hub single-component repositories get the `library/` prefix and the tag defaults to `latest`.
 *
 * @param reference - the image reference, `node:22-slim`, `ghcr.io/org/app:1.0`, `localhost:5000/app@sha256:...`
 * @returns the parsed reference
 */
export function parseImageReference(reference: string): ImageReference {
  let rest = reference.trim();
  if (!rest) {
    throw new Error("Empty image reference");
  }
  let digest: string;
  const at = rest.indexOf("@");
  if (at >= 0) {
    digest = rest.substring(at + 1);
    rest = rest.substring(0, at);
    if (!/^[a-z0-9]+(?:[.+_-][a-z0-9]+)*:[a-zA-Z0-9=_-]+$/.test(digest)) {
      throw new Error(`Invalid digest in image reference '${reference}'`);
    }
  }
  let tag: string;
  const lastSlash = rest.lastIndexOf("/");
  const colon = rest.lastIndexOf(":");
  if (colon > lastSlash) {
    tag = rest.substring(colon + 1);
    rest = rest.substring(0, colon);
  }
  let registry = DOCKER_HUB;
  const firstSlash = rest.indexOf("/");
  if (firstSlash > 0) {
    const first = rest.substring(0, firstSlash);
    if (first.includes(".") || first.includes(":") || first === "localhost") {
      registry = first;
      rest = rest.substring(firstSlash + 1);
    }
  }
  if (registry === "index.docker.io" || registry === DOCKER_HUB_API) {
    registry = DOCKER_HUB;
  }
  if (registry === DOCKER_HUB && !rest.includes("/")) {
    rest = `library/${rest}`;
  }
  if (!/^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*$/.test(rest)) {
    throw new Error(`Invalid repository '${rest}' in image reference '${reference}'`);
  }
  if (tag !== undefined && !isValidTag(tag)) {
    throw new Error(`Invalid tag '${tag}' in image reference '${reference}'`);
  }
  if (tag === undefined && digest === undefined) {
    tag = "latest";
  }
  return { registry, repository: rest, tag, digest };
}

/**
 * Format a reference back to a string
 *
 * @param reference - the reference
 * @returns `registry/repository[:tag][@digest]`
 */
export function formatImageReference(reference: ImageReference): string {
  let result = `${reference.registry}/${reference.repository}`;
  if (reference.tag) {
    result += `:${reference.tag}`;
  }
  if (reference.digest) {
    result += `@${reference.digest}`;
  }
  return result;
}

/**
 * Check a tag against the distribution specification
 *
 * @param tag - the tag
 * @returns true when valid
 */
export function isValidTag(tag: string): boolean {
  return /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(tag);
}

/**
 * Turn a version or any string into a valid tag
 *
 * Semver build metadata uses `+`, which tags do not allow: it becomes `-`.
 *
 * @param value - the value, a version like `1.2.4+20261004120000`
 * @returns a valid tag
 */
export function toTag(value: string): string {
  let tag = `${value}`.replace(/[^a-zA-Z0-9._-]/g, "-").substring(0, 128);
  if (!/^[a-zA-Z0-9_]/.test(tag)) {
    tag = `v${tag}`.substring(0, 128);
  }
  return tag;
}

/**
 * Host to send the registry API requests to
 *
 * @param registry - registry from the reference
 * @returns the API host
 */
export function getRegistryApiHost(registry: string): string {
  return registry === DOCKER_HUB ? DOCKER_HUB_API : registry;
}
