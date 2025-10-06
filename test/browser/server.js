#!/usr/bin/env node

/**
 * WebSocket Test Server for Browser Testing
 *
 * This server is used by Playwright tests to verify browser WebSocket functionality.
 * It provides various endpoints for testing different WebSocket scenarios.
 */

const express = require('express');
const http = require('http');
const WebSocketServer = require('../../lib/WebSocketServer');

const PORT = process.env.PORT || 8080;

// Create Express app
const app = express();

// Serve static files from the browser test directory
app.use(express.static(__dirname));

// Health check endpoint
app.get('/health', (req, res) => {
  res.send('OK');
});

// API endpoint to check WebSocket server status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    connections: connections.size,
    port: PORT
  });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false
});

// Track connections for testing
const connections = new Set();

function originIsAllowed(origin) {
  // Allow all origins for testing
  return true;
}

wsServer.on('request', (request) => {
  if (!originIsAllowed(request.origin)) {
    request.reject();
    console.log(`Connection from origin ${request.origin} rejected.`);
    return;
  }

  const connection = request.accept('echo-protocol', request.origin);
  connections.add(connection);

  console.log(`Connection accepted from ${request.origin}`);

  connection.on('message', (message) => {
    if (message.type === 'utf8') {
      console.log(`Received Message: ${message.utf8Data}`);

      // Handle special test commands
      if (message.utf8Data === 'ping') {
        connection.sendUTF('pong');
      } else if (message.utf8Data === 'close-me') {
        connection.close();
      } else if (message.utf8Data.startsWith('echo:')) {
        // Echo back the message after the "echo:" prefix
        const echoMessage = message.utf8Data.substring(5);
        connection.sendUTF(echoMessage);
      } else {
        // Default: echo the message back
        connection.sendUTF(message.utf8Data);
      }
    } else if (message.type === 'binary') {
      console.log(`Received Binary Message of ${message.binaryData.length} bytes`);
      connection.sendBytes(message.binaryData);
    }
  });

  connection.on('close', (reasonCode, description) => {
    console.log(`Peer ${connection.remoteAddress} disconnected.`);
    connections.delete(connection);
  });

  connection.on('error', (error) => {
    console.error('Connection error:', error);
    connections.delete(connection);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`WebSocket test server listening on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in a browser to test`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  // Close all WebSocket connections
  connections.forEach(conn => {
    try {
      conn.close();
    } catch (err) {
      // Ignore errors during shutdown
    }
  });
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('Forcing shutdown');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
