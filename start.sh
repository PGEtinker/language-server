#!/usr/bin/sh
docker run -it --rm -p "3000:3000" --memory=1g -v "$PWD":/usr/src/app moros1138/pgetinker-language-server:dev npm run dev
