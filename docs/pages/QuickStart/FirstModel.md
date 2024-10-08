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
