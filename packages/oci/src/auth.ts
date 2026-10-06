import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DOCKER_HUB, DOCKER_HUB_API } from "./reference.js";

/**
 * Credentials of a registry
 */
export interface RegistryCredentials {
  /**
   * User name
   */
  username?: string;
  /**
   * Password or access token used with the user name
   */
  password?: string;
  /**
   * Identity token (OAuth2 refresh token) as stored by `docker login` for some registries
   */
  identityToken?: string;
  /**
   * Registry bearer token sent as is, without token exchange
   */
  token?: string;
}

/**
 * Authentication challenge of a registry, from the `WWW-Authenticate` header
 */
export interface AuthChallenge {
  /**
   * `bearer` or `basic`
   */
  scheme: string;
  /**
   * Parameters: `realm`, `service`, `scope`, ...
   */
  parameters: Record<string, string>;
}

/**
 * Parse a `WWW-Authenticate` header
 *
 * @param header - `Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/node:pull"`
 * @returns the challenge, undefined if the header is empty
 */
export function parseAuthChallenge(header: string | null | undefined): AuthChallenge | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^\s*(\S+)\s*(.*)$/s.exec(header);
  const scheme = match[1].toLowerCase();
  const parameters: Record<string, string> = {};
  const pattern = /([a-zA-Z0-9_.-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))\s*,?/g;
  let parameter: RegExpExecArray;
  while ((parameter = pattern.exec(match[2])) !== null) {
    parameters[parameter[1].toLowerCase()] =
      parameter[2] !== undefined ? parameter[2].replace(/\\(.)/g, "$1") : parameter[3];
  }
  return { scheme, parameters };
}

/**
 * Keys a Docker configuration may use for a registry
 *
 * @param registry - registry from the image reference
 * @returns the possible keys
 */
function dockerConfigKeys(registry: string): string[] {
  if (registry === DOCKER_HUB || registry === DOCKER_HUB_API || registry === "index.docker.io") {
    return ["https://index.docker.io/v1/", "index.docker.io", DOCKER_HUB, DOCKER_HUB_API];
  }
  return [registry, `https://${registry}`, `http://${registry}`, `https://${registry}/v1/`, `https://${registry}/v2/`];
}

/**
 * Read the Docker CLI configuration
 *
 * @param env - environment, for `DOCKER_CONFIG`
 * @returns the configuration, empty if missing
 */
export function readDockerConfig(env: Record<string, string | undefined> = process.env): any {
  const path = join(env.DOCKER_CONFIG ?? join(homedir(), ".docker"), "config.json");
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path).toString());
  } catch {
    return {};
  }
}

/**
 * Ask a Docker credential helper (`docker-credential-<helper> get`)
 *
 * @param helper - the helper suffix, `osxkeychain`, `ecr-login`, ...
 * @param serverUrl - the registry key
 * @returns the credentials, undefined when the helper has none
 */
export function getHelperCredentials(helper: string, serverUrl: string): RegistryCredentials | undefined {
  const result = spawnSync(`docker-credential-${helper}`, ["get"], { input: serverUrl, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }
  try {
    const { Username, Secret } = JSON.parse(result.stdout);
    if (!Secret) {
      return undefined;
    }
    return Username === "<token>" ? { identityToken: Secret } : { username: Username, password: Secret };
  } catch {
    return undefined;
  }
}

/**
 * Find the credentials of a registry
 *
 * Order: the explicit credentials, the Docker configuration (`credHelpers`, `auths`, then `credsStore`).
 * Without credentials, the registry is used anonymously.
 *
 * @param registry - registry from the image reference
 * @param explicit - credentials per registry from the parameters
 * @param dockerConfig - the Docker configuration, see {@link readDockerConfig}
 * @param helper - credential helper runner, for tests
 * @returns the credentials, undefined for anonymous access
 */
export function resolveCredentials(
  registry: string,
  explicit: Record<string, RegistryCredentials> = {},
  dockerConfig: any = readDockerConfig(),
  helper: typeof getHelperCredentials = getHelperCredentials
): RegistryCredentials | undefined {
  const keys = dockerConfigKeys(registry);
  for (const key of keys) {
    if (explicit[key]) {
      return explicit[key];
    }
  }
  for (const key of keys) {
    const name = dockerConfig.credHelpers?.[key];
    if (name) {
      return helper(name, key);
    }
  }
  for (const key of keys) {
    const entry = dockerConfig.auths?.[key];
    if (!entry) {
      continue;
    }
    if (entry.identitytoken) {
      return { identityToken: entry.identitytoken };
    }
    if (entry.auth) {
      const decoded = Buffer.from(entry.auth, "base64").toString();
      const separator = decoded.indexOf(":");
      return { username: decoded.substring(0, separator), password: decoded.substring(separator + 1) };
    }
    if (entry.username) {
      return { username: entry.username, password: entry.password };
    }
  }
  if (dockerConfig.credsStore) {
    for (const key of keys) {
      const credentials = helper(dockerConfig.credsStore, key);
      if (credentials) {
        return credentials;
      }
    }
  }
  return undefined;
}
