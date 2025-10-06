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

const WebSocketClient = require('../../lib/WebSocketClient');

const args = { /* defaults */
  secure: false,
  version: 13
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
args.version = parseInt(args.version, 10);

if (!args.host || !args.port) {
  console.log('WebSocket-Node: Test client for Andy Green\'s libwebsockets-test-server');
  console.log('Usage: ./libwebsockets-test-client.js --host=127.0.0.1 --port=8080 [--version=8|13] [--secure]');
  console.log('');
  return;
}

const mirrorClient = new WebSocketClient({
  webSocketVersion: args.version
});

mirrorClient.on('connectFailed', (error) => {
  console.log(`Connect Error: ${error.toString()}`);
});

mirrorClient.on('connect', (connection) => {
  console.log('lws-mirror-protocol connected');
  connection.on('error', (error) => {
    console.log(`Connection Error: ${error.toString()}`);
  });
  connection.on('close', () => {
    console.log('lws-mirror-protocol Connection Closed');
  });  
  function sendCallback(err) {
    if (err) { console.error('send() error: ' + err); }
  }
  function spamCircles() {
    if (connection.connected) {
      // c #7A9237 487 181 14;
      const color = 0x800000 + Math.round(Math.random() * 0x7FFFFF);
      const x = Math.round(Math.random() * 502);
      const y = Math.round(Math.random() * 306);
      const radius = Math.round(Math.random() * 30);
      connection.send(`c #${color.toString(16)} ${x} ${y} ${radius};`, sendCallback);
      setTimeout(spamCircles, 10);
    }
  }
  spamCircles();
});

mirrorClient.connect(`${args.protocol}//${args.host}:${args.port}/`, 'lws-mirror-protocol');


const incrementClient = new WebSocketClient({
  webSocketVersion: args.version
});

incrementClient.on('connectFailed', (error) => {
  console.log(`Connect Error: ${error.toString()}`);
});

incrementClient.on('connect', (connection) => {
  console.log('dumb-increment-protocol connected');
  connection.on('error', (error) => {
    console.log(`Connection Error: ${error.toString()}`);
  });
  connection.on('close', () => {
    console.log('dumb-increment-protocol Connection Closed');
  });
  connection.on('message', (message) => {
    console.log(`Number: '${message.utf8Data}'`);
  });
});

incrementClient.connect(`${args.protocol}//${args.host}:${args.port}/`, 'dumb-increment-protocol');
