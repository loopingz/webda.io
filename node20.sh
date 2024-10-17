#!/bin/bash
docker run -v `pwd`:/code --user `id -u`:`id -g` --rm -it node:20 /bin/bash
