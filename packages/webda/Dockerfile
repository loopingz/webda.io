FROM debian:latest
MAINTAINER loopingz@loopingz.com

RUN apt-get update \
 && apt-get install -y git \
 && apt-get install -y node

RUN mkdir /server/
ADD . /server/

CMD cd /server && node core.js
