# @webda/graphql

Implements the GraphQL protocol with subscriptions and mutations

```
// Add a ping to subscription (useful for testing)
setInterval(() => this.emit("Ping", Date.now()), this.parameters.pingInterval);
subscriptions["Ping"] = {
    type: GraphQLLong,
    subscribe: async (source, args, context: any, info: GraphQLResolveInfo) => {
    return new EventIterator(this, "Ping", "Ping", Date.now()).iterate();
    }
};
```
