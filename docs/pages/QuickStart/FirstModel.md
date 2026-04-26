:::warning Stale — under revision
Parts of this page reference the removed `@webda/shell` package and the
`npx @webda/shell init` flow. The current entry points are `webda` (from
`@webda/core`) and `webdac` (from `@webda/compiler`). For an up-to-date
walkthrough, see [Tutorial-BlogSystem](./Tutorial-BlogSystem/00-Overview).
:::

# My First Model

To create a model, you need to define a class that inherits from `Model`.

```typescript
import { CoreModel } from "@webda/core";

type MyEvents = {
  myEvent: (data: any) => void;
};

class MyModel extends CoreModel {
  declare Events: MyEvents;
}
```
