# @webda/compiler

This package is used to compile a webda module and generate the corresponding code along with the `webda.module.json` file.

## Code

The `code` command ensure your Webda objects have some methods defined and auto-generate the missing ones.

For `Service`:

- ensure the `loadParameters` method is defined and load the defined parameters

For `Model`:

- ensure the `unserialize` method is defined and load the object correctly
