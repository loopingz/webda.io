# Role Model

`RoleModel` (`@webda/core`) implements a role-based permission system: each action requires one role, and the action is allowed when the current user has that role.

Roles come from the current user (`user.getRoles()`) and are cached in the session.

## Define the roles map

`getRolesMap()` maps an action to the role it requires. `isPermissive()` decides for actions without a mapping (refused by default).

```typescript
import { RoleModel } from "@webda/core";

export class MyModel extends RoleModel {
  getRolesMap() {
    return {
      get: "viewer",
      update: "editor",
      delete: "owner"
    };
  }
}
```

See [Model Permissions](../../Modules/models/Permissions.md#rolemodel).
