# Configuration Secrets

Secrets in `webda.config.jsonc`, a deployment file or a dynamic configuration source (file, Kubernetes ConfigMap/Secret, store...) can be committed encrypted. Webda decrypts them when it loads the configuration, before any service is created.

## Quick start

1. Prefix the plain value with `encrypt:<encrypter>:`

```jsonc title="webda.config.jsonc"
{
  "services": {
    "db": {
      "type": "PostgresStore",
      "postgresqlServer": {
        "host": "db.example.com",
        // Encrypted by `webda config encrypt`
        "password": "encrypt:gcp:my-db-password"
      }
    }
  }
}
```

2. Run the command, it replaces the marked values in place and keeps the comments (json, jsonc and yaml)

```bash
webda config encrypt -f webda.config.jsonc
```

```jsonc title="webda.config.jsonc"
        "password": "crypt:gcp:cHJvamVjdHMv...:CiQAk3Jx..."
```

3. Commit the file: the service receives the decrypted value at runtime.

The command loads the application like any other command: the values already encrypted in the application
configuration must be decryptable on this machine (for example `WEBDA_CONFIG_PASSWORD` set for `password` values).

## Value formats

| Written by you               | Written by `webda config encrypt` | Decrypted to     |
| ---------------------------- | --------------------------------- | ---------------- |
| `encrypt:<encrypter>:value`  | `crypt:<encrypter>:<data>`        | a `SecretString` |
| `sencrypt:<encrypter>:value` | `scrypt:<encrypter>:<data>`       | a plain `string` |

A value still marked `encrypt:` when the application starts is passed as is, with a warning in the logs.

### SecretString

`crypt:` values become a `SecretString` from `@webda/core`. It masks itself everywhere a value can leak:
`toString()`, template literals, `JSON.stringify` and `util.inspect` all return `********`. The plain value is
only available with `getValue()`.

The library services that hold secrets (database passwords and connection strings, cloud credentials, OAuth client
secrets, SMTP authentication, registry credentials...) accept a `SecretString`. Use `scrypt:` only for a third-party
module that requires a plain string.

## Encrypters

| Name       | Package          | Key                                                    | Use it for                                 |
| ---------- | ---------------- | ------------------------------------------------------ | ------------------------------------------ |
| `local`    | `@webda/core`    | the machine id, or the `WEBDA_MACHINE_ID` variable     | local development secrets, never shared    |
| `password` | `@webda/runtime` | a password, from `WEBDA_CONFIG_PASSWORD` or a prompt   | small teams sharing a password out of band |
| `gcp`      | `@webda/gcp`     | a Google Cloud KMS key, `WEBDA_GCP_KMS_KEY` to encrypt | production, access managed by IAM          |

An encrypter is available once its package is a dependency of the application: the package registers it when the
application loads its modules.

- **local**: a value encrypted on one machine can only be decrypted on the same machine. Set the same
  `WEBDA_MACHINE_ID` on several machines (or in a container) to share it.
- **password**: the password is read from `WEBDA_CONFIG_PASSWORD`, otherwise asked once in the terminal. A server
  needs the environment variable.
- **gcp**: encrypting needs `WEBDA_GCP_KMS_KEY=projects/<project>/locations/<location>/keyRings/<ring>/cryptoKeys/<key>`
  and the `cloudkms.cryptoKeyVersions.useToEncrypt` permission. The key name is stored with the value, so decrypting
  only needs the `useToDecrypt` permission on the application identity.

`local` and `password` use AES-256-GCM: a wrong key, a wrong password or an altered value fails with an error,
it never produces a wrong secret.

The `self` encrypter of `CryptoService` relies on the keys in the Registry, which are only available once the services
are initialized: it cannot be used in the configuration.

## Rotating and migrating

Re-encrypt every encrypted value with another encrypter, for example to move from `local` to `gcp` before deploying:

```bash
webda config encrypt -f webda.config.jsonc --migrate gcp
```

Re-encrypt every encrypted value with its own encrypter, to its current format (values written by earlier versions use an
older unauthenticated format, still readable):

```bash
webda config encrypt -f webda.config.jsonc --upgrade
```

## Errors

Decryption errors stop the application at startup, with the configuration path and the encrypter, never the value:

```
Cannot decrypt the value at services.db.postgresqlServer.password with encrypter 'local': Wrong key or altered data
Unknown encrypter 'gcp' at services.db.postgresqlServer.password (registered: local, password)
```

- `Wrong key or altered data`: `local` value from another machine, or the file was modified.
- `Wrong password or altered data`: wrong `WEBDA_CONFIG_PASSWORD`.
- `Unknown encrypter`: the package providing it is not a dependency of the application.

## Using secrets in your services

Type a secret parameter as `string | SecretString` and read it with `SecretString.from`. It also accepts a plain
string, with a warning that does not contain the value. Its JSON schema stays a `string`.

```typescript
import { SecretString, Service, ServiceParameters } from "@webda/core";

export class MyServiceParameters extends ServiceParameters {
  /**
   * API key of the partner
   *
   * Can be encrypted with `webda config encrypt`
   */
  apiKey: string | SecretString;
}

export class MyService extends Service<MyServiceParameters> {
  async init(): Promise<this> {
    await super.init();
    this.client = new PartnerClient({ apiKey: SecretString.from(this.parameters.apiKey, "MyService.apiKey") });
    return this;
  }
}
```

To pass an option object that can hold secrets to a third-party client, use `SecretString.unwrap`: it returns a copy
with plain values, without warnings.

```typescript
const client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer));
```

## Custom encrypter

Register an encrypter as a side effect of a module your application loads, so it is available before the services
are created. `decrypt` must throw when the data cannot be decrypted, and `encrypt` must return a single-line string.

```typescript
import { CryptoService } from "@webda/core";

CryptoService.registerEncrypter("vault", {
  encrypt: async (data: string) => vault.encrypt("transit/webda", data),
  decrypt: async (data: string) => vault.decrypt("transit/webda", data)
});
```

Encrypter names use letters, digits, `_`, `-` and `.`.

## API

- `CryptoService.registerEncrypter(name, encrypter)` and `CryptoService.getEncrypter(name)`
- `CryptoService.encryptConfiguration(data, { migrate })`: encrypts the marked values, in place
- `CryptoService.decryptConfiguration(data)`: returns a decrypted copy
- `SecretString.from(value, path)`, `SecretString.unwrap(value)`, `secret.getValue()`
