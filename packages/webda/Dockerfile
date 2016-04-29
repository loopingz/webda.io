FROM docker.loopingz.com/webda:latest
MAINTAINER loopingz@loopingz.com

ADD . /server/

RUN mkdir -p /etc/webda
CMD cd /server && node server.js > /data/webda.log
