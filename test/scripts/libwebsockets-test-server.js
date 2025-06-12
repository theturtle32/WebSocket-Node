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
const WebSocketRouter = require('../../lib/WebSocketRouter');
const http = require('http');
const fs = require('fs');

const args = { /* defaults */
  secure: false
};

/* Parse command line options */
const pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach((value) => {
  const match = pattern.exec(value);
  if (match) {
    args[match[1]] = match[2] ? match[2] : true;
  }
});

args.protocol = args.secure ? 'wss:' : 'ws:';

if (!args.port) {
  console.log('WebSocket-Node: Test Server implementing Andy Green\'s');
  console.log('libwebsockets-test-server protocols.');
  console.log('Usage: ./libwebsockets-test-server.js --port=8080 [--secure]');
  console.log('');
  return;
}

if (args.secure) {
  console.log('WebSocket-Node: Test Server implementing Andy Green\'s');
  console.log('libwebsockets-test-server protocols.');
  console.log('ERROR: TLS is not yet supported.');
  console.log('');
  return;
}

const server = http.createServer((request, response) => {
  console.log(`${new Date()} Received request for ${request.url}`);
  if (request.url === '/') {
    fs.readFile('libwebsockets-test.html', 'utf8', (err, data) => {
      if (err) {
        response.writeHead(404);
        response.end();
      }
      else {
        response.writeHead(200, {
          'Content-Type': 'text/html'
        });
        response.end(data);
      }
    });
  }
  else {
    response.writeHead(404);
    response.end();
  }
});
server.listen(args.port, () => {
  console.log(`${new Date()} Server is listening on port ${args.port}`);
});

const wsServer = new WebSocketServer({
  httpServer: server
});

const router = new WebSocketRouter();
router.attachServer(wsServer);


const mirrorConnections = [];

let mirrorHistory = [];

function sendCallback(err) {
  if (err) { console.error('send() error: ' + err); }
}

router.mount('*', 'lws-mirror-protocol', (request) => {
  const cookies = [
    {
      name: 'TestCookie',
      value: `CookieValue${Math.floor(Math.random()*1000)}`,
      path: '/',
      secure: false,
      maxage: 5000,
      httponly: true
    }
  ];
    
  // Should do origin verification here. You have to pass the accepted
  // origin into the accept method of the request.
  const connection = request.accept(request.origin, cookies);
  console.log(`${new Date()} lws-mirror-protocol connection accepted from ${connection.remoteAddress} - Protocol Version ${connection.webSocketVersion}`);


    
  if (mirrorHistory.length > 0) {
    const historyString = mirrorHistory.join('');
    console.log(`${new Date()} sending mirror protocol history to client; ${connection.remoteAddress} : ${Buffer.byteLength(historyString)} bytes`);
        
    connection.send(historyString, sendCallback);
  }
    
  mirrorConnections.push(connection);
    
  connection.on('message', (message) => {
    // We only care about text messages
    if (message.type === 'utf8') {
      // Clear canvas command received
      if (message.utf8Data === 'clear;') {
        mirrorHistory = [];
      }
      else {
        // Record all other commands in the history
        mirrorHistory.push(message.utf8Data);
      }

      // Re-broadcast the command to all connected clients
      mirrorConnections.forEach((outputConnection) => {
        outputConnection.send(message.utf8Data, sendCallback);
      });
    }
  });

  connection.on('close', (closeReason, description) => {
    const index = mirrorConnections.indexOf(connection);
    if (index !== -1) {
      console.log(`${new Date()} lws-mirror-protocol peer ${connection.remoteAddress} disconnected, code: ${closeReason}.`);
      mirrorConnections.splice(index, 1);
    }
  });
    
  connection.on('error', (error) => {
    console.log(`Connection error for peer ${connection.remoteAddress}: ${error}`);
  });
});

router.mount('*', 'dumb-increment-protocol', (request) => {
  // Should do origin verification here. You have to pass the accepted
  // origin into the accept method of the request.
  const connection = request.accept(request.origin);
  console.log(`${new Date()} dumb-increment-protocol connection accepted from ${connection.remoteAddress} - Protocol Version ${connection.webSocketVersion}`);

  let number = 0;
  connection.timerInterval = setInterval(() => {
    connection.send((number++).toString(10), sendCallback);
  }, 50);
  connection.on('close', () => {
    clearInterval(connection.timerInterval);
  });
  connection.on('message', (message) => {
    if (message.type === 'utf8') {
      if (message.utf8Data === 'reset\n') {
        console.log(`${new Date()} increment reset received`);
        number = 0;
      }
    }
  });
  connection.on('close', (closeReason, description) => {
    console.log(`${new Date()} dumb-increment-protocol peer ${connection.remoteAddress} disconnected, code: ${closeReason}.`);
  });
});

console.log('WebSocket-Node: Test Server implementing Andy Green\'s');
console.log('libwebsockets-test-server protocols.');
console.log(`Point your WebSocket Protocol Version 8 complant browser to http://localhost:${args.port}/`);
