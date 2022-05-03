# WebdaQL

## Operators

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

## Order By

You can use `ORDER BY` to order the results, this is not a hard requirements to manage it on underlying Store.

Currently, `MongoDB`, `Postgres`, `File` and `Memory` have a full ORDER BY capabilities

`DynamoDB` have some hard limitation, only the sortKey can be ordered and every other ORDER BY clause will be ignored

`FireBase` have also limitations, only the defined index with their direction will be able to be used, every other ORDER BY clause will be ignored

## Limit and Offset

To define the LIMIT just add LIMIT