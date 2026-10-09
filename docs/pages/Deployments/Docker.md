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

## Reproducible images

The container deployer of `@webda/oci` (`Webda/ContainerDeployer`) builds the image without Docker, and the same
sources give the same image digest, on any machine:

- every file of the application layer has the same owner, permissions (only the executable bit is kept) and
  modification time, and the files are sorted;
- the image creation date and the file modification time are `SOURCE_DATE_EPOCH` (in seconds), `0` by default;
- the application version baked in the image (`git.version`, also the default tag) is the package version on a release
  tag, otherwise a snapshot version dated by `SOURCE_DATE_EPOCH` or the commit date, in UTC: `1.2.4+20261004130507000`.
  Uncommitted changes add a hash of the changes: `1.2.4+20261004130507000.dirty.1a2b3c4d`.

The base image must be pinned by digest for the image to stay the same over time, a tag can move to a new image:

```json title="deployments/production.json"
{
  "units": [
    {
      "name": "Image",
      "type": "Webda/ContainerDeployer",
      "baseImage": "node:22-slim@sha256:<digest>",
      "image": "ghcr.io/my-org/my-app"
    }
  ]
}
```

The build logs a warning when the base image is not pinned. The `node_modules` content comes from your lockfile:
install with `--frozen-lockfile`.

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
