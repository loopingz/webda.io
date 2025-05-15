Models -> Blue icon

Services -> Green icon

Deployments -> Yellow icon

Core -> White icon

## v4 What's new??

- Models are now protected constructor to avoid confusion
- Stores are now pure raw data
- Services parameters now are auto created by the framework
- @webda/core and @webda/shell were split into more modules
- codemod to migrate from v3 to v4 is provided
- AsyncLocalStorage is used to provide execution context
- @webda/test replace @testdeck/mocha

Drawbacks:

- A model class is not directly castable to a ModelDefinition of itself, because of events definition, so it should be casted to a ModelDefinition
