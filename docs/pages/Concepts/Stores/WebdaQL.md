# WebdaQL

## References

AWS: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html
https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html

Firebase: https://firebase.google.com/docs/firestore/query-data/queries

MongoDB: https://www.mongodb.com/docs/manual/tutorial/query-documents/

## ANTRL4TS

Validator: Ensure the parsing of the query
Visitor: query() / filter(CoreModel): boolean

## WebdaQL

### Operators

```
= equal to
< less than
> greater than
<= less than or equal to
>= greater than or equal to
IN array
LIKE 
```

```
AND:
OR:

Precedence
a AND b OR c is equivalent to (a AND b) OR c
a AND b OR c AND d is equivalent to (a AND b) OR (c AND d)
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