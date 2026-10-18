# Configuration

You have several layers of configuration for your services:

## The build time context:

ApplicationContext is `webda.config.jsonc`

DeploymentContext is `deployments/{name}.jsonc`

Deployment can override service types and add new service. It allows you to define a different database between your deployment for example

## The runtime context:

ConfigurationService based on the configuration service you can alter your services configuration from a filesystem, a kubernetes configmap or secrets, a database item, etc.

At runtime you cannot add new services, nor you can change the services types. It is done for security reason.

## Models and behavior attributes

Model configuration lives outside persisted instances. It applies to every instance of the selected model. Use a
fully qualified model identifier and select each behavior by its attribute name:

```jsonc
{
  "models": {
    "MyApp/User": {
      "parameters": { "retentionDays": 30 },
      "behaviors": {
        "mfa": { "purpose": "login", "methods": ["totp"] },
        "paymentMfa": { "purpose": "step-up", "verificationMaxAge": 60, "recoveryCodes": 0 }
      }
    }
  }
}
```

Models and behaviors declare an exported parameter class through `static Parameters`:

```typescript
import { Parameters, User, useModelParameters } from "@webda/core";

export class UserParameters extends Parameters {
  /** Retention in days. @minimum 1 */
  retentionDays: number = 30;
}

export class ApplicationUser extends User {
  static Parameters = UserParameters;

  retentionDays(): number {
    return useModelParameters(ApplicationUser).retentionDays;
  }
}
```

For a behavior, resolve the policy using its owning class and attribute:

```typescript
const policy = useBehaviorParameters(this.parent.instance.constructor, this.parent.attribute, MyBehavior);
```

The compiler emits parameter schemas separately from model input, output, and storage schemas. Configuration
schemas expose the declared model and behavior parameters, including their type constraints. Parameter access
constructs the declared class, loads overrides, and validates the result including defaults. Configuration never
becomes part of a model's stored record or public output.

Resolution follows parameter-class defaults, each model's declared `BehaviorParameters` defaults, parent-model
configuration, and the concrete model's configuration. More specific values win. A subclass can declare its own
`static BehaviorParameters` for defaults on its attributes. `deployments/<name>` can override the same `models`
section; objects merge and arrays replace earlier arrays.

These policies are loaded with application/deployment configuration. Restart the application when changing which
MFA attribute has the login purpose. Global `parameters` continue to apply to services; they are not implicitly
copied into model or behavior policies.

## Secrets

Secrets can be committed encrypted in any of these layers with `webda config encrypt`, see [Configuration Secrets](../Security/ConfigurationSecrets.md).

## See also

- [Core Architecture](../Modules/core/Architecture.md)
- [webda.config.json reference](./Webda.config.json.md)
- [Configuration Secrets](../Security/ConfigurationSecrets.md)
