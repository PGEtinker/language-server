FROM moros1138/pgetinker:latest as build

FROM node:21-bookworm-slim

WORKDIR /usr/src/app
COPY . .
COPY --from=build /opt/emsdk /opt/emsdk

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get -y update && \
    apt-get install -y \
    wget \
    unzip \
    micro && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /

RUN wget https://github.com/clangd/clangd/releases/download/18.1.3/clangd-linux-18.1.3.zip && \
    unzip clangd-linux-18.1.3.zip && \
    mv clangd_18.1.3/bin/clangd /usr/local/bin/ && \
    mv clangd_18.1.3/lib/clang /usr/local/lib/ && \
    rm -rf clangd_18.1.3

WORKDIR /usr/src/app

RUN chown -R node:node /usr/src/app

RUN npm install && npm run build

EXPOSE 3000

CMD [ "npm", "run", "start" ]
