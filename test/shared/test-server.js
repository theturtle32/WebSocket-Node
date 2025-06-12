const http = require('http');
const WebSocketServer = require('../../lib/WebSocketServer');

let server;
let wsServer;

function prepare(callback) {
  if (typeof(callback) !== 'function') { callback = () => {}; }
  server = http.createServer(function(request, response) {
    response.writeHead(404);
    response.end();
  });

  wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    maxReceivedFrameSize: 64*1024*1024,   // 64MiB
    maxReceivedMessageSize: 64*1024*1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: false,
    disableNagleAlgorithm: false
  });

  server.listen(64321, function(err) {
    if (err) {
      return callback(err);
    }
    callback(null, wsServer);
  });
}

function stopServer() {
  try {
    wsServer.shutDown();
    server.close();
  }
  catch(e) {
    console.warn('stopServer threw', e);
  }
}

module.exports = {
  prepare,
  stopServer
};
