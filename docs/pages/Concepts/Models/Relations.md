# Relations between models

Relations between models are defined using attributes in the model class.
It has helpers injected in the attribute that will help define the relation.

These relation attributes are self-managed and should not be modified directly.

# ModelParent

The `ModelParent` is used to define a hierarchy between models.
This attribute must be specified when creating a new model.

If parent is deleted, all children are deleted (Cascading delete): the default delete policy of a parent relation,
`@OnDelete RESTRICT` or `@OnDelete NONE` on the attribute changes it. A `ModelLink` does nothing when its target is
deleted unless the attribute declares `@OnDelete CASCADE` or `@OnDelete SET_NULL`. See
[Delete policies](../../Modules/models/Relationships.md#delete-policies).
The REST routes are also cascading, and similar for GraphQL.

You can still expose them as Root by adding `@Expose({root: true})`

# ModelLink

The `ModelLink` is used to define a 0:n relation between models.
This attribute is normally a Nullable Foreign Key within a Relational DataBase.

# ModelRelated

This attribute is used to define a n:1 relation between models.
It is used to query on the opposite side of the relation.

With this example: `ModelRelated<Company, "country">`.

If the opposite side is a `ModelLink`, it will add a query like `Company.query("country = ${this.getUuid()}")`, so you when you call `country.companies.query("sector = 'IT'")`, it will return all companies in the IT sector in the country running in reality this query `country = ${this.getUuid()} AND sector = 'IT'`.

If the opposite side is a `ModelLinksSimpleArray`, it will add a query like `Company.query("country CONTAINS ${this.getUuid()}")`, so you when you call `country.companies.query("sector = 'IT'")`, it will return all companies in the IT sector in the country running in reality this query `country CONTAINS ${this.getUuid()} AND sector = 'IT'`.

If the opposite side is a `ModelLinksMap`, it will add a query like `Company.query("country.${this.getUuid()} IS NOT NULL")`, so you when you call `country.companies.query("sector = 'IT'")`, it will return all companies in the IT sector in the country running in reality this query `country.${this.getUuid()} IS NOT NULL AND sector = 'IT'`.

# ModelLinksSimpleArray

This attribute is used to define a n:m relation between models. It is an array of uuid of the targeted model.
You can update the targets. It is seen more as a helper to manage the relation.

# ModelLinksArray

This attribute is used to define a n:m relation between models. It is an array of object containing the uuid of the targeted model and some additional data.

# ModelLinksMap

This attribute is used to define a n:m relation between models. It is a map of uuid of the targeted model to some attributes.

# Overriding User / Ident

When overriding built-in models such as `Webda/User` or `Webda/Ident`, relation symmetry between query and link attributes must be maintained:

```typescript
export class AppUser extends User {
  _idents: ModelRelated<AppIdent, AppUser, "_user">;
}

export class AppIdent extends Ident {
  declare _user: ModelLink<AppUser>;
}
```

### Validation Rules

During application startup and store initialization (`Store.computeStores()`), Webda validates relationship symmetry:

- **R1**: Target attribute omitted in `ModelRelated` (logged as `DEBUG`).
- **R2**: Dangling reverse relation where target attribute does not exist on the target model (logged as `WARN`).
- **R3**: Reverse relation targets an unrelated model (logged as `WARN`).
- **R4**: Reverse relation targets an ancestor model, and both models resolve to the same backing store (logged as `INFO`).
- **R5**: Reverse relation targets an ancestor model, but the models resolve to different backing stores (logged as `WARN`).

### Resolving Store Routing Mismatches

If an app defines a custom user (e.g. `App/User`) managed by a dedicated store (e.g. `Users`), but `Webda/Ident._user` targets `Webda/User` which falls back to `Registry`, an R5 warning is logged.

To resolve it:
1. **Override the reverse link in your custom Ident**:
   ```typescript
   export class AppIdent extends Ident {
     declare _user: ModelLink<AppUser>;
   }
   ```
2. **Let the store manage the base `Webda/User`**:
   Add `"Webda/User"` to the store's `models` configuration:
   ```json
   {
     "services": {
       "Users": {
         "type": "MemoryStore",
         "models": ["Webda/User", "App/User"]
       }
     }
   }
   ```

## See also

- [Model Relationships](../../Modules/models/Relationships.md)
- [Models overview](./Models.md)
