---
name: webda-deploy
description: Use when deploying a Webda app, adding a deployment environment or building a container image or Lambda package
---

# Webda deploy

## When to use

Adding an environment (`deployments/<name>.json`), building and pushing an OCI image, packaging the app for AWS Lambda or deploying it with CloudFormation.

## Pattern

A deployment is a file `deployments/<name>.json` (`.jsonc`, `.yaml` and `.yml` work too). It has four sections:

- `parameters` and `services` override `webda.config.json` (objects deep merged, arrays replaced; see webda-configuration).
- `units` lists the deployers: each unit has a `name`, a `type` and the deployer parameters.
- `resources` holds parameters shared by every unit; a unit overrides them.

```json
{
  "parameters": {
    "supportEmail": "support@example.com"
  },
  "services": {
    "ReminderService": { "delayHours": 48 }
  },
  "units": [
    {
      "name": "image",
      "type": "Webda/ContainerDeployer",
      "image": "ghcr.io/my-org/my-app",
      "tags": ["${package.version}", "latest"],
      "credentials": {
        "ghcr.io": { "username": "${env.GHCR_USER}", "password": "${env.GHCR_TOKEN}" }
      }
    }
  ]
}
```

Select the deployment with `-d <name>` before the command, `--deployment <name>` anywhere, or the `WEBDA_DEPLOYMENT` environment variable. The same selection applies to `serve` and `debug`: they run the app with the overrides of that deployment.

```bash
webda -d production container build   # OCI layout in .webda/oci/<unit>, base layers included
webda -d production container push    # build and push every tag of the unit
webda -d production aws package       # Lambda zip (LambdaPackager unit), dist/lambda-<version>.zip by default
webda -d production deploy            # run `deploy` of every unit that has it (ContainerDeployer, CloudFormationDeployer)
webda -d production --service image container push   # only the unit named image
```

Units of other types in the same deployment:

```json
{
  "units": [
    { "name": "package", "type": "Webda/LambdaPackager", "zipPath": "dist/app.zip" },
    {
      "name": "stack",
      "type": "Webda/CloudFormationDeployer",
      "AssetsBucket": "my-artifacts",
      "Lambda": {},
      "APIGateway": {}
    }
  ]
}
```

Units are not services of the app: a unit is only instantiated by a command its type provides, `serve` and `debug` never create it. `${...}` templates in unit parameters (`${package.version}`, `${git.commit}`, `${deployment}`, `${env.NAME}`) are replaced when the command runs.

## Common mistakes

```text
Deployer config in "services"                → it goes in "units"; "services" only overrides app services
A unit named like an app service             → DEPLOYMENT_UNIT_CONFLICT, rename the unit
Running a deployer command without -d        → DEPLOYMENT_REQUIRED: select the deployment
Secrets in deployments/*.json                → "${env.NAME}" in a unit parameter, value in the environment
```

## Verify

`webda -d production container build` logs `Built sha256:... in <path>` (it downloads the base image layers once, so it needs network access). `webda --help` lists the commands of the installed deployers (`@webda/oci`, `@webda/aws`).

## Reference

https://docs.webda.io

Written for Webda 4.0.0-beta.
