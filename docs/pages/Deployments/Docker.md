# Docker

You can use webda to build your Docker image for you

## Dockerfile

Package the application with its deployment, then copy the package in the image:

```dockerfile
FROM node:22 AS build
WORKDIR /src
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm run build
RUN pnpm exec webda -d production package -o /package

FROM node:22-slim
WORKDIR /app
COPY --from=build /package .
CMD ["node", "node_modules/@webda/core/lib/bin/cli.js", "serve", "--bind", "0.0.0.0"]
```

The image contains the deployed `webda.config.json` (see [Package a deployment](./Deployments.md#package-a-deployment)),
so it is served without `-d` and without the `deployments/` folder. The package has no `node_modules/.bin`:
the CLI is started from `@webda/core`, like the images of the container deployer.

## Configuration

The configuration take only two parameters the tag of the image to create and if it needs to push the image after a succesfull build.

```javascript
{
   tag: "mytag",
   push: true
}

```

## Different webda versions

If your current webda shell is not align with the application webda, you should set the environment `WEBDA_SHELL_DEPLOY_VERSION` when launching

```
WEBDA_SHELL_DEPLOY_VERSION=1.2.3 webda deploy -d Docker
```
