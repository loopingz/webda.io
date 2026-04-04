# Configuration

You have several layers of configuration for your services:

## The build time context:

ApplicationContext is `webda.config.jsonc`

DeploymentContext is `deployments/{name}.jsonc`

Deployment can override service types and add new service. It allows you to define a different database between your deployment for example

## The runtime context:

ConfigurationService based on the configuration service you can alter your services configuration from a filesystem, a kubernetes configmap or secrets, a database item, etc.

At runtime you cannot add new services, nor you can change the services types. It is done for security reason.