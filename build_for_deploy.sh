#!/usr/bin/sh

git clone https://github.com/Moros1138/PGEtinker

rm -rf include 

mv PGEtinker/third_party/v0.02/include ./

rm -rf PGEtinker

docker buildx build --pull -t moros1138/pgetinker-language-server:latest .

docker push moros1138/pgetinker-language-server:latest
