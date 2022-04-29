# WebdaQL Developement

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

