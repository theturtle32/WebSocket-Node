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
const wsVersion = require('../../lib/websocket').version;
const querystring = require('querystring');

const args = { /* defaults */
  secure: false,
  port: '9000',
  host: 'localhost'
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

console.log('WebSocket-Node: Echo test client for running against the Autobahn test suite');
console.log('Usage: ./libwebsockets-test-client.js --host=127.0.0.1 --port=9000 [--secure]');
console.log('');


console.log('Starting test run.');

// Using v2.0 Promise-based API for cleaner async flow
(async () => {
  try {
    const caseCount = await getCaseCount();

    for (let currentCase = 1; currentCase <= caseCount; currentCase++) {
      await runTestCase(currentCase, caseCount);
    }

    console.log('Test suite complete, generating report.');
    await updateReport();
    console.log('Report generated.');
  } catch (error) {
    console.error('Test suite error:', error);
    process.exit(1);
  }
})();


async function runTestCase(caseIndex, caseCount) {
  console.log(`Running test ${caseIndex} of ${caseCount}`);
  const echoClient = new WebSocketClient({
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
  });

  const qs = querystring.stringify({
    case: caseIndex,
    agent: `WebSocket-Node Client v${wsVersion}`
  });

  try {
    const connection = await echoClient.connect(`ws://${args.host}:${args.port}/runCase?${qs}`, []);

    // Wait for connection to close
    await new Promise((resolve, reject) => {
      connection.on('error', (error) => {
        console.log(`Connection Error: ${error.toString()}`);
      });

      connection.on('close', () => {
        resolve();
      });

      connection.on('message', async (message) => {
        try {
          if (message.type === 'utf8') {
            await connection.sendUTF(message.utf8Data);
          }
          else if (message.type === 'binary') {
            await connection.sendBytes(message.binaryData);
          }
        } catch (err) {
          console.error(`Send error: ${err}`);
        }
      });
    });
  } catch (error) {
    console.log(`Connect Error: ${error.toString()}`);
  }
}

async function getCaseCount() {
  const client = new WebSocketClient();

  const connection = await client.connect(`ws://${args.host}:${args.port}/getCaseCount`, []);

  return new Promise((resolve, reject) => {
    let caseCount = NaN;

    connection.on('close', () => {
      resolve(caseCount);
    });

    connection.on('message', (message) => {
      if (message.type === 'utf8') {
        console.log(`Got case count: ${message.utf8Data}`);
        caseCount = parseInt(message.utf8Data, 10);
      }
      else if (message.type === 'binary') {
        reject(new Error('Unexpected binary message when retrieving case count'));
      }
    });
  });
}

async function updateReport() {
  const client = new WebSocketClient();
  const qs = querystring.stringify({
    agent: `WebSocket-Node Client v${wsVersion}`
  });

  const connection = await client.connect(`ws://localhost:9000/updateReports?${qs}`);

  return new Promise((resolve) => {
    connection.on('close', resolve);
  });
}
