# Acl Model

`ResourceAcl` (`@webda/core`) implements a basic ACL system: an array of entries `{ action, type: "USER" | "GROUP", principal, allow }` stored as a model attribute. The model delegates its permissions to it:

```typescript
async canAct(context: IOperationContext, action: string) {
  return ResourceAcl.from(this.acl ?? []).canAct(context, action);
}
```

See [Model Permissions](../../Modules/models/Permissions.md#resourceacl).
