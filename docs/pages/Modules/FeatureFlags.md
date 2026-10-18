# Feature Flags

Webda provides a built-in feature flagging mechanism to gate operations, endpoints, and business logic based on callers, session attributes, or gradual rollouts.

## Built-in Service: `Webda/FeatureFlags`

The core framework provides the `Webda/FeatureFlags` service, which supports boolean flags, WebdaQL conditions on sessions, targeting keys, and percentage-based rollouts.

### Configuration

Add `Webda/FeatureFlags` to your `webda.config.json` or `webda.config.jsonc`:

```jsonc
{
  "services": {
    "featureFlags": {
      "type": "Webda/FeatureFlags",
      "flags": {
        "new-checkout": {
          "condition": "roles CONTAINS 'beta'",
          "percentage": 20
        },
        "Orders.Export": true,
        "safe-delete": false
      },
      "operations": {
        "Posts.Delete": "safe-delete",
        "Admin.*": "admin-v2"
      },
      "defaultValue": false
    }
  }
}
```

### Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `flags` | `Record<string, boolean \| FlagDefinition>` | `{}` | Flag configurations (see below). |
| `operations` | `Record<string, string>` | `{}` | Pattern-to-flag mappings (e.g. `Posts.Delete: "safe-delete"`, `Admin.*: "admin-v2"`). |
| `defaultValue` | `boolean` | `false` | Default evaluation result when a flag is not recognized by any provider. |

#### Flag Definition Options

- **`enabled?: boolean`**: Master toggle. If explicitly `false`, all targeting, conditions, and percentages evaluate to off. Default is `true`.
- **`condition?: string`**: WebdaQL query evaluated against the session (e.g., `roles CONTAINS 'beta'`). Compiled at configuration load time.
- **`percentage?: number`**: Stable 0–100 rollout percentage based on deterministic SHA1 hashing of `${flag}:${targetingKey}`. Without a `targetingKey`, `percentage < 100` evaluates to `false`.
- **`targets?: string[]`**: Explicit allow-list of targeting keys (user ID, session ID).

### Hot Reload

Because `Webda/FeatureFlags` subscribes to the `Webda.Configuration.Applied` event, flags can be toggled and conditions recompiled at runtime without restarting the application:

```ts
useCore().updateConfiguration({
  services: {
    featureFlags: {
      flags: {
        "new-checkout": true
      }
    }
  }
});
```

---

## Writing a Custom Provider

External flag providers (LaunchDarkly, Unleash, OpenFeature, etc.) can be plugged in by implementing `FeatureFlagProvider` and registering via `registerFeatureFlagProvider()`:

```ts
import {
  Bean,
  Service,
  FeatureFlagProvider,
  FeatureFlagContext,
  registerFeatureFlagProvider
} from "@webda/core";

@Bean
export class LaunchDarklyFlags extends Service implements FeatureFlagProvider {
  private client: any;

  resolve() {
    super.resolve();
    registerFeatureFlagProvider(this, 10);
    return this;
  }

  async isEnabled(flag: string, ctx: FeatureFlagContext): Promise<boolean | undefined> {
    return this.client.variation(flag, { key: ctx.targetingKey ?? "anonymous" }, undefined);
  }
}
```

Providers are evaluated in descending order of priority. The first provider returning a non-`undefined` boolean determines the result. If a provider throws an exception, it is logged as a warning and treated as `false` (fail-closed).
