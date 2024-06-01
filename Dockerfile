FROM moros1138/pgetinker:latest as build

FROM node:21-bookworm-slim

WORKDIR /usr/src/app
COPY . .
COPY --from=build /opt/emsdk /opt/emsdk
COPY --from=build /var/www/html/third_party/v0.02/include include


RUN npm install && npm run build

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get -y update && \
    apt-get install -y \
    micro \
    clangd && \
    rm -rf /var/lib/apt/lists/*

RUN chown -R node:node /usr/src/app
