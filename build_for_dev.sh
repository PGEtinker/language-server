#!/usr/bin/sh

echo "Updating Includes"
git clone https://github.com/Moros1138/PGEtinker > /dev/null

rm -rf include > /dev/null

mv PGEtinker/third_party/v0.02/include ./ > /dev/null

rm -rf PGEtinker > /dev/null

echo "Building Dev Image"
docker buildx build --pull -t moros1138/pgetinker-language-server:dev -f Dockerfile.dev .
