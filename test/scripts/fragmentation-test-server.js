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
const bufferAllocUnsafe = require('../../lib/utils').bufferAllocUnsafe;
const http = require('http');
const fs = require('fs');

console.log('WebSocket-Node: Test server to spit out fragmented messages.');

const args = {
  'no-fragmentation': false,
  'fragment': '16384',
  'port': '8080'
};

/* Parse command line options */
const pattern = /^--(.*?)(?:=(.*))?$/;
process.argv.forEach((value) => {
  const match = pattern.exec(value);
  if (match) {
    args[match[1]] = match[2] ? match[2] : true;
  }
});

args.protocol = 'ws:';

if (args.help) {
  console.log('Usage: ./fragmentation-test-server.js [--port=8080] [--fragment=n] [--no-fragmentation]');
  console.log('');
  return;
}
else {
  console.log('Use --help for usage information.');
}

const server = http.createServer((request, response) => {
  console.log(`${new Date()} Received request for ${request.url}`);
  if (request.url === '/') {
    fs.readFile('fragmentation-test-page.html', 'utf8', (err, data) => {
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
  httpServer: server,
  fragmentOutgoingMessages: !args['no-fragmentation'],
  fragmentationThreshold: parseInt(args['fragment'], 10)
});

const router = new WebSocketRouter();
router.attachServer(wsServer);


const lorem = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat.';


router.mount('*', 'fragmentation-test', (request) => {
  const connection = request.accept(request.origin);
  console.log(`${new Date()} connection accepted from ${connection.remoteAddress}`);

    
  connection.on('message', (message) => {
    function sendCallback(err) {
      if (err) { console.error('send() error: ' + err); }
    }
    if (message.type === 'utf8') {
      let length = 0;
      let match = /sendMessage\|(\d+)/.exec(message.utf8Data);
      let requestedLength;
      if (match) {
        requestedLength = parseInt(match[1], 10);
        let longLorem = '';
        while (length < requestedLength) {
          longLorem += (`  ${lorem}`);
          length = Buffer.byteLength(longLorem);
        }
        longLorem = longLorem.slice(0,requestedLength);
        length = Buffer.byteLength(longLorem);
        if (length > 0) {
          connection.sendUTF(longLorem, sendCallback);
          console.log(`${new Date()} sent ${length} byte utf-8 message to ${connection.remoteAddress}`);
        }
        return;
      }
            
      match = /sendBinaryMessage\|(\d+)/.exec(message.utf8Data);
      if (match) {
        requestedLength = parseInt(match[1], 10);
                
        // Generate random binary data.
        const buffer = bufferAllocUnsafe(requestedLength);
        for (let i=0; i < requestedLength; i++) {
          buffer[i] = Math.ceil(Math.random()*255);
        }
                
        connection.sendBytes(buffer, sendCallback);
        console.log(`${new Date()} sent ${buffer.length} byte binary message to ${connection.remoteAddress}`);
        return;
      }
    }
  });

  connection.on('close', (reasonCode, description) => {
    console.log(`${new Date()} peer ${connection.remoteAddress} disconnected.`);
  });
    
  connection.on('error', (error) => {
    console.log(`Connection error for peer ${connection.remoteAddress}: ${error}`);
  });
});

console.log(`Point your WebSocket Protocol Version 8 compliant browser at http://localhost:${args.port}/`);
if (args['no-fragmentation']) {
  console.log('Fragmentation disabled.');
}
else {
  console.log(`Fragmenting messages at ${wsServer.config.fragmentationThreshold} bytes`);
}
