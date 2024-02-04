---
sidebar_label: "@webda/tsc-esm"
---
# tsc-esm

This is a wrapper around tsc to compile typescript to esm format without the culprit of having to add '.js' at the end of your import.

When you work with typescript this is valid

```
import { MyClass } from './myclass';
```

But the official compiler will generate a file named `myclass.js` and you will have to write

```
import { MyClass } from './myclass.js';
```

This is not really clean in my opinion, so this wrapper will allow you to use the first syntax and will take care of fixing the `.js` issue for you.

Reference on the famous issue on typescript: https://github.com/microsoft/TypeScript/issues/16577

## Usage

You can run the compiler directly with

```bash
npx @webda/tsc-esm
```

Or add it to your project with

```
# NPM
npm add --dev @webda/tsc-esm
# Yarn
yarn add --dev @webda/tsc-esm
# pnpm
pnpm add --dev @webda/tsc-esm
```

Update your `package.json` to add a script

```json
{
  "scripts": {
    "build": "tsc-esm"
  }
}
```
