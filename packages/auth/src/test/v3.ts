import { Password } from "@webda/core";

/** Writes a raw row into a store's backing storage */
export type RawWriter = (key: string, row: any) => void;

/**
 * Seed a v3 email user and its ident RAW (Ruling R1): the v3 layout is written straight into the storage,
 * bypassing model constructors and serializers
 * @param write - raw storage writer (MemoryStore storage map, FileStore folder, ...)
 * @param email - email (normalised)
 * @param opts - options
 * @param opts.validated - whether the v3 ident was validated
 * @param opts.password - clear password hashed into `__password`
 * @param opts.userId - user uuid
 * @returns the user uuid
 */
export async function seedV3(
  write: RawWriter,
  email: string,
  opts: { validated: boolean; password: string; userId?: string }
): Promise<string> {
  const hash = new Password();
  await hash.set(opts.password);
  const userId = opts.userId ?? `v3-${email}`;
  write(userId, {
    uuid: userId,
    __type: "Webda/User",
    email,
    displayName: email,
    __password: hash.__hash,
    _lastPasswordRecovery: 0
  });
  seedV3Ident(write, email, "email", userId, {
    email,
    _failedLogin: 1,
    _lastValidationEmail: 42,
    ...(opts.validated ? { _validation: "2020-01-01T00:00:00.000Z" } : {})
  });
  return userId;
}

/**
 * Seed a raw v3 ident `"<uid>_<provider>"`
 * @param write - raw storage writer
 * @param uid - provider uid
 * @param provider - provider
 * @param userId - owner uuid
 * @param extra - extra v3 fields
 * @returns the v3 key
 */
export function seedV3Ident(write: RawWriter, uid: string, provider: string, userId: string, extra: any = {}): string {
  const key = `${uid}_${provider}`;
  write(key, { uuid: key, __type: "Webda/Ident", _type: provider, _user: userId, ...extra });
  return key;
}
