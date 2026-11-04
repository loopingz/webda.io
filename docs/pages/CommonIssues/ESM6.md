# ES6 Modules

NodeJS now is able to have module there is a few differences:

```
require become import
__dirname, __filename are not available anymore
```

TypeScript does not add the `.js` extension to relative imports, so ESM output needs the extension
written in the source:

```
import { MyClass } from "./myclass.js";
```

Webda packages build with plain `tsc` under `"module": "nodenext"`, which enforces this. In the Webda
repository, `scripts/add-import-extensions.mjs` adds the missing extensions to older sources.

If you need `__dirname` or `__filename` you can use:

```
import { getCommonJS } from "@webda/core";
const { __dirname, __filename } = getCommonJS(import.meta.url);
```