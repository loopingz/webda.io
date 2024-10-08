# Interfaces

Why do you have so many interfaces? Why not just use classes?

The project in v3 had many cyclic dependencies, we decided to use interfaces to break them and make the code more testable.

Check for your cyclic dependencies with the following command:

```bash
npx madge --circular --extensions ts src
npx skott --showCircularDependencies --displayMode=raw
```
