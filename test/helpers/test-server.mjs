import http from 'http';
import WebSocketServer from '../../lib/WebSocketServer.js';

let server;
let wsServer;
let serverPort;

export function prepare() {
  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      response.writeHead(404);
      response.end();
    });

    wsServer = new WebSocketServer({
      httpServer: server,
      autoAcceptConnections: false,
      maxReceivedFrameSize: 64 * 1024 * 1024,   // 64MiB
      maxReceivedMessageSize: 64 * 1024 * 1024, // 64MiB
      fragmentOutgoingMessages: false,
      keepalive: false,
      disableNagleAlgorithm: false
    });

    server.listen(0, (err) => {
      if (err) {
        return reject(err);
      }
      serverPort = server.address().port;
      wsServer.port = serverPort;
      resolve(wsServer);
    });
  });
}

export function getPort() {
  return serverPort;
}

export function stopServer() {
  return new Promise((resolve) => {
    try {
      if (wsServer) {
        wsServer.shutDown();
      }
      if (server) {
        server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    } catch (e) {
      console.warn('stopServer threw', e);
      resolve();
    }
  });
}