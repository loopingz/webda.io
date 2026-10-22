import type { EscrowBlob, KeyringBlob, PublicKeyEntry } from "@webda/core/lib/sealed/index.js";

/** Public key `{ kid, jwk }` submitted to the server */
export type PublicKeyInput = PublicKeyEntry;

/** A user public key as served by the server (`User.keys.publicKeys`) */
export type ServedPublicKey = PublicKeyEntry & {
  /** Seal algorithm */
  alg?: string;
  /** Creation, ms since epoch */
  createdAt?: number;
  /** Retirement, ms since epoch: the newest key without it is the active one */
  retiredAt?: number;
};

/** A registered device (metadata only) */
export type ServedDevice = { id: string; name: string; createdAt?: number; lastSeenAt?: number };

/** Escrow kinds */
export type EscrowKind = EscrowBlob["kind"];

/**
 * The `User.Keys.*` operations of the server, supplied by the host application (see {@link restKeysApi})
 */
export interface KeysApi {
  /**
   * Public part of the user keys
   * @returns the served public keys (oldest first) and devices
   */
  getKeys(): Promise<{ publicKeys: ServedPublicKey[]; devices: ServedDevice[] }>;
  /**
   * `User.Keys.Setup`: first enrollment
   * @param publicKey - first public key
   * @param keyring - keyring encrypted for it
   * @param escrows - escrows of the keyring key by kind
   */
  setup(
    publicKey: PublicKeyInput,
    keyring: KeyringBlob,
    escrows: Partial<Record<EscrowKind, EscrowBlob>>
  ): Promise<void>;
  /**
   * `User.Keys.GetEscrow` (throttled, fresh authentication required)
   * @param kind - escrow kind
   * @returns the escrow, the encrypted keyring and the public keys
   */
  getEscrow(kind: EscrowKind): Promise<{ escrow: EscrowBlob; keyring: KeyringBlob; publicKeys: ServedPublicKey[] }>;
  /**
   * `User.Keys.SetEscrow`: create or replace an escrow
   * @param kind - escrow kind
   * @param escrow - escrow blob
   */
  setEscrow(kind: EscrowKind, escrow: EscrowBlob): Promise<void>;
  /**
   * `User.Keys.RemoveEscrow`: the server refuses to remove the last escrow while no device is registered (409)
   * @param kind - escrow kind
   */
  removeEscrow(kind: EscrowKind): Promise<void>;
  /**
   * `User.Keys.GetKeyring` (fresh authentication required, not throttled): the encrypted keyring alone, to refresh a
   * stale local copy with the keyring key this device holds
   * @returns the encrypted keyring and the public keys
   */
  getKeyring(): Promise<{ keyring: KeyringBlob; publicKeys: ServedPublicKey[] }>;
  /**
   * `User.Keys.Rotate`: new active public key, keyring re-encrypted for it
   * @param publicKey - new public key
   * @param keyring - keyring holding every private key, encrypted for the new key
   * @param escrows - escrows of a new keyring key, the current escrows are kept when omitted
   */
  rotate(
    publicKey: PublicKeyInput,
    keyring: KeyringBlob,
    escrows?: Partial<Record<EscrowKind, EscrowBlob>>
  ): Promise<void>;
  /**
   * `User.Keys.RegisterDevice`
   * @param name - device name
   * @returns the device id
   */
  registerDevice(name: string): Promise<{ id: string }>;
  /**
   * `User.Keys.RevokeDevice`
   * @param id - device id
   */
  revokeDevice(id: string): Promise<void>;
}

/** Minimal `fetch` used by {@link restKeysApi} (the global `fetch` fits) */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Options of {@link restKeysApi} */
export interface RestKeysApiOptions {
  /** Prefix of the REST routes (the `url` of the REST transport), e.g. `https://host/api` */
  baseUrl?: string;
  /** Path of the user, relative to `baseUrl`, when User is nested (default `/users/<userId>`) */
  userPath?: string;
}

/** A `User.Keys.*` REST call failed */
export class KeysApiError extends Error {
  /**
   * @param status - HTTP status
   * @param message - error message
   */
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "KeysApiError";
  }
}

/**
 * {@link KeysApi} over the Webda REST transport: behavior actions are routed as `<user>/keys.<action>` with their
 * parameters in a JSON body, the public keys are read from the user (`GET <user>`, attribute `keys`)
 * @param fetchLike - fetch, carrying the session (cookies or authorization header)
 * @param userId - user uuid
 * @param options - route prefix
 * @returns the api
 */
export function restKeysApi(fetchLike: FetchLike, userId: string, options: RestKeysApiOptions = {}): KeysApi {
  const user = `${options.baseUrl ?? ""}${options.userPath ?? `/users/${encodeURIComponent(userId)}`}`;
  const call = async (method: string, url: string, body?: object): Promise<any> => {
    const res = await fetchLike(
      url,
      body === undefined
        ? { method }
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    );
    const text = await res.text();
    if (!res.ok) {
      throw new KeysApiError(res.status, `${method} ${url} failed with ${res.status}${text ? `: ${text}` : ""}`);
    }
    return text ? JSON.parse(text) : undefined;
  };
  const action = (method: string, name: string, body: object) => call(method, `${user}/keys.${name}`, body);
  return {
    async getKeys() {
      const { keys } = (await call("GET", user)) ?? {};
      return { publicKeys: keys?.publicKeys ?? [], devices: keys?.devices ?? [] };
    },
    setup: (publicKey, keyring, escrows) => action("POST", "setup", { publicKey, keyring, escrows }),
    getEscrow: kind => action("POST", "getEscrow", { kind }),
    setEscrow: (kind, escrow) => action("PUT", "setEscrow", { kind, escrow }),
    removeEscrow: kind => action("DELETE", "removeEscrow", { kind }),
    getKeyring: () => call("GET", `${user}/keys.getKeyring`),
    rotate: (publicKey, keyring, escrows) =>
      action("POST", "rotate", escrows === undefined ? { publicKey, keyring } : { publicKey, keyring, escrows }),
    registerDevice: name => action("POST", "registerDevice", { name }),
    revokeDevice: id => action("DELETE", "revokeDevice", { id })
  };
}
