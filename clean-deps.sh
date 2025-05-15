#!/bin/sh
ls packages | xargs -I{} -L1 rm -rf packages/{}/node_modules
rm -rf node_modules
rm -rf sample-app/node_modules