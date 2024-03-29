# Docker

You can use webda to build your Docker image for you

## Dockerfile

You can create your own Dockerfile, if no Dockerfile is present then the default one is used

```
FROM node:latest
MAINTAINER docker@webda.io

RUN mkdir /server/
ADD . /server/

RUN cd /server && rm -rf node_modules && npm install
CMD cd /server && node_modules/.bin/webda serve > /data/webda.log
```

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
