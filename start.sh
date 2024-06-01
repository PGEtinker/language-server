#!/usr/bin/sh

# start the dev version of the server
docker run -it --rm -p "3000:3000" --memory=1g -v "$PWD":/usr/src/app moros1138/pgetinker-language-server npm run dev
