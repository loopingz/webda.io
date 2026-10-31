import { SecretString } from "@webda/core";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DOCKER_HUB, DOCKER_HUB_API } from "./reference.js";

/**
 * Credentials of a registry, as configured
 */
export interface RegistryCredentials {
  /**
   * User name
   */
  username?: string;
  /**
   * Password or access token used with the user name
   *
   * Can be encrypted with `webda config encrypt`
   */
  password?: string | SecretString;
  /**
   * Identity token (OAuth2 refresh token) as stored by `docker login` for some registries
   *
   * Can be encrypted with `webda config encrypt`
   */
  identityToken?: string | SecretString;
  /**
   * Registry bearer token sent as is, without token exchange
   *
   * Can be encrypted with `webda config encrypt`
   */
  token?: string | SecretString;
}

/**
 * Credentials of a registry with plain values, as sent to the registry
 */
export interface PlainRegistryCredentials {
  /**
   * User name
   */
  username?: string;
  /**
   * Password or access token used with the user name
   */
  password?: string;
  /**
   * Identity token (OAuth2 refresh token)
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
  if (!match) {
    return undefined;
  }
  const scheme = match[1].toLowerCase();
  const parameters: Record<string, string> = {};
  const input = match[2];
  let cursor = 0;
  while (cursor < input.length) {
    while (cursor < input.length && (input[cursor] === "," || /\s/.test(input[cursor]))) cursor++;
    const start = cursor;
    while (cursor < input.length && /[a-zA-Z0-9_.-]/.test(input[cursor])) cursor++;
    const key = input.slice(start, cursor).toLowerCase();
    while (cursor < input.length && /\s/.test(input[cursor])) cursor++;
    if (!key || input[cursor] !== "=") {
      const comma = input.indexOf(",", cursor);
      if (comma === -1) break;
      cursor = comma + 1;
      continue;
    }
    cursor++;
    while (cursor < input.length && /\s/.test(input[cursor])) cursor++;
    let value = "";
    if (input[cursor] === '"') {
      cursor++;
      let closed = false;
      while (cursor < input.length) {
        const char = input[cursor++];
        if (char === '"') {
          closed = true;
          break;
        }
        value += char === "\\" && cursor < input.length ? input[cursor++] : char;
      }
      if (!closed) break;
    } else {
      const valueStart = cursor;
      while (cursor < input.length && input[cursor] !== "," && !/\s/.test(input[cursor])) cursor++;
      value = input.slice(valueStart, cursor);
    }
    parameters[key] = value;
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
export function getHelperCredentials(helper: string, serverUrl: string): PlainRegistryCredentials | undefined {
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
 * @returns the credentials with plain values, undefined for anonymous access
 */
export function resolveCredentials(
  registry: string,
  explicit: Record<string, RegistryCredentials> = {},
  dockerConfig: any = readDockerConfig(),
  helper: typeof getHelperCredentials = getHelperCredentials
): PlainRegistryCredentials | undefined {
  const keys = dockerConfigKeys(registry);
  for (const key of keys) {
    if (explicit[key]) {
      // Encrypted values are replaced by their plain value
      return SecretString.unwrap(explicit[key]) as PlainRegistryCredentials;
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
