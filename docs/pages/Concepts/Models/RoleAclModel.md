# Acl Model

This implement a Acl Model system with one role per invidual or group.
Each role have a numerical value.

So if you have three roles

 - Viewer (0)
 - Editor (1)
 - Owner  (2)

Each action get a value defined, if the role is greater or equal to the action value, the action is allowed

## Define model paremeters

```
const RoleMap = {
  Viewer: ["get", "get_binary"],
  Editor: ["update", "attach_binary", "detach_binary"],
  Owner: ["*"]
};

export default class MyModel extends RoleAclModel<typeof RoleMap> {
  getActionsRolesMap(): { Viewer: any[]; Editor: any[]; Owner: any[] } {
    return RoleMap;
  }
}

```
