# Common Issues

`ERROR NoRootTypeError: No root type "UnpackedConfiguration" found` when running `webda build`

You need to enforce a version of typescript common for `@webda/shell` and `ts-json-schema-generator`

You can in your package.json

```
"resolutions": {
    "typescript": "^4.7.4"
}
```