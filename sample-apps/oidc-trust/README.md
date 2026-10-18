# OIDC trust between two Webda applications

App A (**orders**) calls App B (**billing**) with **no shared secret**. Orders proves its identity with a short-lived
token signed by its own keys; billing verifies it against the public keys orders publishes, and its IAM sees the caller
as `app:orders`.

```
 curl ──POST /checkout──▶ orders :18081                       billing :18082
                          OIDCIssuer + CryptoService           OIDCVerifier + IAMService
                          OIDCClient.fetch ──POST /invoices──▶ Bearer <jwt, iss=http://localhost:18081,
                                                                            sub=app:orders,
                                                                            aud=http://localhost:18082>
                                           ◀──GET /.well-known/openid-configuration, GET /jwks──
```

1. `Orders.Checkout` calls `useOIDCClient().fetch("http://localhost:18082/invoices", ...)`. The `OIDCClient` asks the
   `OIDCIssuer` to mint a token for the audience `http://localhost:18082` (the url origin) and adds
   `Authorization: Bearer <jwt>`.
2. Billing's `OIDCVerifier` sees a token from the trusted issuer `http://localhost:18081`, fetches its discovery
   document and JWKS, checks the signature, audience and the `sub` claim, and creates a stateless application session
   with the principal `orders`.
3. Billing's `IAMService` governs `Invoices.*`: the policy `InvoiceWriter` is attached to `app:orders`, so
   `Invoices.Create` is allowed. Any other caller is refused.

## Layout

| File                       | What                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| `src/orders.service.ts`    | `Orders` service, operation `Orders.Checkout` (`POST /checkout`)                  |
| `src/billing.service.ts`   | `Billing` service, operation `Invoices.Create` (`POST /invoices`)                 |
| `webda.config.json`        | Shared services: `HttpServer`, `RESTOperationsTransport`                          |
| `deployments/orders.json`  | Orders: port 18081, `CryptoService` (JWKS on `/jwks`), `OIDCIssuer`, `OIDCClient` |
| `deployments/billing.json` | Billing: port 18082, `OIDCVerifier`, `IAMService` and its `MemoryStore`           |

The same package runs as either application by selecting a deployment (`webda -d orders serve` /
`webda -d billing serve`). In real life they would be two separate projects; only the deployment files matter here.

## Run

```bash
pnpm run build

# Terminal 1: orders on http://localhost:18081
pnpm run orders        # webda -d orders serve

# Terminal 2: billing on http://localhost:18082
pnpm run billing       # webda -d billing serve
```

## Try it

Orders publishes its discovery document and public keys:

```bash
curl -s http://localhost:18081/.well-known/openid-configuration
# {"issuer":"http://localhost:18081","jwks_uri":"http://localhost:18081/jwks","id_token_signing_alg_values_supported":["RS256"],...}
curl -s http://localhost:18081/jwks
# {"keys":[{"kty":"RSA","n":"...","e":"AQAB","kid":"...","use":"sig","alg":"RS256"}]}
```

Checkout an order: orders calls billing with its workload token.

```bash
curl -s -X POST http://localhost:18081/checkout \
  -H 'Content-Type: application/json' -d '{"order":"ord-1","amount":4200}'
# {"id":"inv-...","order":"ord-1","amount":4200,"createdBy":"app:orders"}
```

`createdBy` is computed by billing from its session: billing authenticated the caller as `app:orders`. The billing
log shows:

```
[ INFO] Invoice for order ord-1 requested by app:orders (issuer http://localhost:18081)
```

Calling billing directly, without a token or with a token it does not trust, is refused by IAM:

```bash
curl -s -i -X POST http://localhost:18082/invoices \
  -H 'Content-Type: application/json' -d '{"order":"ord-1","amount":4200}'
# HTTP/1.1 403 Forbidden
# {"error":{"code":"FORBIDDEN","message":"Invoices.Create PermissionDenied"}}
```

## Going further

- In production the issuer must be an `https` URL reachable by the verifier; `http` is only accepted for
  `localhost`/`127.0.0.1`.
- The verifier can also trust external issuers (Kubernetes service accounts, GitHub Actions, GCP) and the client can
  get its token from them (`source: "file" | "github-actions" | "gcp-metadata"`).

See [docs/pages/Security/OIDC.md](../../docs/pages/Security/OIDC.md) for the full documentation.
