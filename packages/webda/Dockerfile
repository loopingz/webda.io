FROM debian:latest
MAINTAINER loopingz@loopingz.com

RUN apt-get update \
 && apt-get install -y git \
 && apt-get install -y nodejs

RUN mkdir /server/
ADD . /server/

RUN apt-get install -y npm
RUN cd /server && npm install
RUN mkdir /etc/webda
CMD cd /server && nodejs core.js
