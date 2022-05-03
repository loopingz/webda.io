# WebdaQL Developement

## References

AWS: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html
https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html

Firebase: https://firebase.google.com/docs/firestore/query-data/queries

MongoDB: https://www.mongodb.com/docs/manual/tutorial/query-documents/

## ANTRL4TS

Validator: Ensure the parsing of the query
Visitor: query() / filter(CoreModel): boolean

## Testing

The default Store unit test includes a `query` test

It creates 1000 users
 - `state` attribute is split between `"CA", "OR", "NY", "FL"` evenly (250 each)
 - `order` attribute equals 0 to 999
 - `team.id` attribute is split evenly from 0 to 19 (50 each)
 - `role` attribute is split evenly from 0 to 9 (100 each)

Then a few query are tested:

```
state = "CA" -> 250
team.id > 15 -> 200
team.id >= 15 -> 250
state IN ["CA", "NY"] -> 500
state IN ["CA", "NY", "NV"] -> 500
state = "CA" AND team.id > 15 -> 50
team.id < 5 OR team.id > 15 -> 450
role < 5 AND team.id > 10 OR team.id > 15 -> 400
role < 5 AND (team.id > 10 OR team.id > 15) -> 200
```

## DynamoDB

Require Key, then Sort
Then filtering

### Operators

```
= equal to
< less than
> greater than
<= less than or equal to
>= greater than or equal to
a BETWEEN b AND c

For filtering:
OR
IN
CONTAINS
```

## Firebase

You can't combine not-in and != in a compound query.
In a compound query, range (<, <=, >, >=) and not equals (!=, not-in) comparisons must all filter on the same field.

### Operators

```
< less than
<= less than or equal to
== equal to
> greater than
>= greater than or equal to
!= not equal to
array-contains
array-contains-any
in
not-in
```

## MongoDB

### Operators


