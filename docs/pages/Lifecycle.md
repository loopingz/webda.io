# Lifecycle

- Application is created
    - Load webda.config.json
    - Load webda.module.json if not cachedModule
    - If UnpackedApplication, find all webda.module.json in node_modules
    - Load configuration with deployment override if any
- Core is created 
    - Create ConfigurationService if any, init and update configuration accordingly
    - Create all other services
    - Resolve on all services
    - Init Registry and CryptoService
    - Init all other services



## Service

When creating a Service, define its parameters

resolve: 
init: 



## Future

 - MultiConfiguration service: to allow load secrets from secrets and config from configmap
 