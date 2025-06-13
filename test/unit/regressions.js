const test = require('tape');

const WebSocketClient = require('../../lib/WebSocketClient');
const startEchoServer = require('../shared/start-echo-server');

test('Issue 195 - passing number to connection.send() shouldn\'t throw', function(t) {
  startEchoServer((err, echoServer) => {
    if (err) { return t.fail('Unable to start echo server: ' + err); }
    
    const client = new WebSocketClient();
    client.on('connect', (connection) => {
      t.pass('connected');
      
      t.doesNotThrow(() => {
        connection.send(12345);
      });
      
      connection.close();
      echoServer.kill();
      t.end();
    });
    
    client.on('connectFailed', (errorDescription) => {
      echoServer.kill();
      t.fail(errorDescription);
      t.end();
    });
    
    client.connect('ws://localhost:8080', null);
  });
});
