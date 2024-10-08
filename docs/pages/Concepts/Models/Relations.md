# Relations between models

Relations between models are defined using attributes in the model class.
It has helpers injected in the attribute that will help define the relation.

These relation attributes are self-managed and should not be modified directly.

# ModelParent

The `ModelParent` is used to define a hierarchy between models.
This attribute must be specified when creating a new model.

If parent is deleted, all children are deleted (Cascading delete).
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
