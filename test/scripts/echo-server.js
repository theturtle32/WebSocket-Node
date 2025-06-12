#!/usr/bin/env node
/************************************************************************
 *  Copyright 2010-2015 Brian McKelvey.
 *
 *  Licensed under the Apache License, Version 2.0 (the 'License');
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ***********************************************************************/

const WebSocketServer = require('../../lib/WebSocketServer');
const http = require('http');

const args = { /* defaults */
    port: '8080',
    debug: false
};

/* Parse command line options */
const pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach((value) => {
    const match = pattern.exec(value);
    if (match) {
        args[match[1]] = match[2] ? match[2] : true;
    }
});

const port = parseInt(args.port, 10);
const debug = args.debug;

console.log('WebSocket-Node: echo-server');
console.log('Usage: ./echo-server.js [--port=8080] [--debug]');

const server = http.createServer((request, response) => {
    if (debug) { console.log(`${new Date()} Received request for ${request.url}`); }
    response.writeHead(404);
    response.end();
});
server.listen(port, () => {
    console.log(`${new Date()} Server is listening on port ${port}`);
});

const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
});

wsServer.on('connect', (connection) => {
    if (debug) { console.log(`${new Date()} Connection accepted - Protocol Version ${connection.webSocketVersion}`); }
    function sendCallback(err) {
        if (err) {
          console.error(`send() error: ${err}`);
          connection.drop();
          setTimeout(() => {
            process.exit(100);
          }, 100);
        }
    }
    connection.on('message', (message) => {
        if (message.type === 'utf8') {
            if (debug) { console.log(`Received utf-8 message of ${message.utf8Data.length} characters.`); }
            connection.sendUTF(message.utf8Data, sendCallback);
        }
        else if (message.type === 'binary') {
            if (debug) { console.log(`Received Binary Message of ${message.binaryData.length} bytes`); }
            connection.sendBytes(message.binaryData, sendCallback);
        }
    });
    connection.on('close', (reasonCode, description) => {
        if (debug) { console.log(`${new Date()} Peer ${connection.remoteAddress} disconnected.`); }
        connection._debug.printOutput();
    });
});
