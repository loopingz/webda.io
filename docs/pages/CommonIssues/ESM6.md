# ES6 Modules

NodeJS now is able to have module there is a few differences:

```
require become import
__dirname, __filename are not available anymore
```

Typescript is not adding the `.js` at the end of import, compiling to a non-working code.
I cannot disagree more with the Microsoft team on this one, so to simplify the `webda build`
command will add `.js` for every local import found.

Webda itself have to build the core module with `tsc-esm` it is a mod around typescript to add the `.js` extension for you.

If you need `__dirname` or `__filename` you can use:

```
import { getCommonJS } from "@webda/core";
const { __dirname, __filename } = getCommonJS(import.meta.url);
```