# Application

The default application is designed to only read its own configuration and start the services it needs.

## UnpackedApplication

This class is used during development it will search for `webda.module.json` and reassemble them.

## SourceApplication

This class is used during development it will search for `webda.module.json` and reassemble them.
It compiles the code and analyze it to generate a `webda.module.json` file for the current module.
