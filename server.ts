import { WebSocketServer, ServerOptions } from 'ws';
import { IncomingMessage, Server } from 'node:http';
import express from 'express';
import { URL } from 'node:url';
import { Socket } from 'node:net';
import { IWebSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import { createConnection, createServerProcess, forward } from 'vscode-ws-jsonrpc/server';
import { Message, InitializeRequest, InitializeParams } from 'vscode-languageserver';
import * as cp from 'child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

enum RunMode {
    development = "development",
    production = "production"
}

const mode: RunMode | string = process.env.MODE ||  RunMode.production;

function isProduction() : boolean
{
    return mode == RunMode.production;
}

function isDevelopment() : boolean
{
    return !isProduction();
}

enum LanguageName {
    /** https://clangd.llvm.org/ */
    clangd = 'clangd',
}

interface LanguageServerRunConfig {
    serverName: string;
    pathName: string;
    serverPort: number;
    runCommand: LanguageName | string;
    runCommandArgs: string[];
    wsServerOptions: ServerOptions,
    spawnOptions?: cp.SpawnOptions;
}

function log(...args: any[])
{
    if(isDevelopment())
    {
        console.log(...args);
    }
}

function filterLink(link: string)
{
    [
        "/opt/emsdk/upstream/emscripten/cache/sysroot",
        process.cwd() + "/include/olcPixelGameEngine/utilites",
        process.cwd() + "/include/olcPixelGameEngine/extensions",
        process.cwd() + "/include/olcPixelGameEngine",
        process.cwd() + "/include/olcSoundWaveEngine",
        process.cwd() + "/include",
    ].forEach((value) =>
    {
        link = link.replace(value, "/***");
    });

    return link;
}

/**
 * start the language server inside the current process
 */
const launchLanguageServer = (runconfig: LanguageServerRunConfig, socket: IWebSocket) => {
    
    const { serverName, runCommand, runCommandArgs, spawnOptions } = runconfig;
    
    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);
    
    // start the language server as an external process
    const socketConnection = createConnection(reader, writer, () => socket.dispose());
    const serverConnection = createServerProcess(serverName, runCommand, runCommandArgs, spawnOptions);
    
    if (serverConnection)
    {
        forward(socketConnection, serverConnection, message =>
        {
            if (Message.isRequest(message))
            {
                log(`${serverName} Server received:`);
                log(message);
                
                if(message.method === InitializeRequest.type.method)
                {
                    const initializeParams = message.params as InitializeParams;
                    initializeParams.processId = process.pid;
                }
            }

            if(Message.isResponse(message))
            {

                if(message.result)
                {
                    log(`${serverName} Server sent:`);

                    if((message.result as []).length > 0)
                    {
                        (message.result as []).forEach((item) =>
                        {
                            let keys = Object.keys(item);
    
                            if(keys.includes("target"))
                            {
                                (item as any).target = `unavailable`;
                            }
                            return undefined;
                        });
                    }

                    if((message.result as any).contents?.value)
                    {
                        // @ts-ignore
                        message.result.contents.value = filterLink(message.result.contents.value);
                    }
                    
                    log(message);
                }
                
            }
            
            return message;
        });
    }
};

const upgradeWsServer = (runconfig: LanguageServerRunConfig,
    config: {
        server: Server,
        wss: WebSocketServer
    }) =>
{
    config.server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) =>
    {
        const baseURL = `http://${request.headers.host}/`;
        const pathName = request.url ? new URL(request.url, baseURL).pathname : undefined;

        if (pathName === runconfig.pathName)
        {
            config.wss.handleUpgrade(request, socket, head, webSocket =>
            {
                const socket: IWebSocket = {
                    send: content => webSocket.send(content, error => {
                        if (error) {
                            throw error;
                        }
                    }),
                    onMessage: cb => webSocket.on('message', (data) => {
                        if(isDevelopment())
                        {
                            console.log(data.toString());
                        }
                        cb(data);
                    }),
                    onError: cb => webSocket.on('error', cb),
                    onClose: cb => webSocket.on('close', cb),
                    dispose: () => webSocket.close()
                };
                
                // launch the server when the web socket is opened
                if (webSocket.readyState === webSocket.OPEN)
                {
                    launchLanguageServer(runconfig, socket);
                }
                else
                {
                    webSocket.on('open', () =>
                    {
                        launchLanguageServer(runconfig, socket);
                    });
                }
            });
        }
    });
};

/** LSP server runner */
const runLanguageServer = (
    languageServerRunConfig: LanguageServerRunConfig
) => {
    
    let compileCommandsTemplate: string = readFileSync(path.join(process.cwd(), "compile_commands.template"), "utf-8");
    writeFileSync(path.join(process.cwd(), "compile_commands.json"), compileCommandsTemplate.replace("{{cwd}}", process.cwd()))
    
    process.on('uncaughtException', (error) =>
    {
        console.error('Uncaught Exception: ', error.toString());
        if (error.stack) {
            console.error(error.stack);
        }
    });

    // create the express application
    const app = express();

    // start the http server
    const httpServer: Server = app.listen(languageServerRunConfig.serverPort);
    const wss = new WebSocketServer(languageServerRunConfig.wsServerOptions);
    
    // keep the connections alive with a simple ping every 30 seconds
    const pingInterval = setInterval(() =>
    {
        wss.clients.forEach((ws) =>
        {
            if (ws.OPEN)
            {
                ws.ping();
            }
        });
    }, 30000);

    // create the web socket
    upgradeWsServer(languageServerRunConfig, {
        server: httpServer,
        wss
    });

    process.on("SIGINT", () =>
    {
        clearInterval(pingInterval);
        wss.clients.forEach((ws) =>
        {
            ws.close();
        });
        wss.close();

        process.exit();
    });
    
};

runLanguageServer({
    serverName: 'CLANGD',
    pathName: '/clangd',
    serverPort: 3000,
    runCommand: "clangd",
    runCommandArgs: [
        `--compile-commands-dir=${process.cwd()}`,
        '--background-index=false',
        '--all-scopes-completion=false',
        '--function-arg-placeholders=true',
        '--completion-style=bundled',
    ],
    wsServerOptions: {
        noServer: true,
        perMessageDeflate: false,
        clientTracking: true,
        verifyClient: (
            clientInfo: { origin: string; secure: boolean; req: IncomingMessage },
            callback
        ) => {
            const parsedURL = new URL(`${clientInfo.origin}${clientInfo.req?.url ?? ''}`);
            const authToken = parsedURL.searchParams.get('authorization');
            if (authToken === 'UserAuth') {
                callback(true);
            } else {
                callback(false);
            }
        }
    }
});
