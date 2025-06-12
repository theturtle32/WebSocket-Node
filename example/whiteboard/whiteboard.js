#!/usr/bin/env node
/************************************************************************
 *  Copyright 2010-2015 Brian McKelvey.
 *  
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  
 *      http://www.apache.org/licenses/LICENSE-2.0
 *  
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ***********************************************************************/

const WebSocketServer = require('../../lib/websocket').server;
const express = require('express');

const app = express.createServer();

app.configure(function() {
    app.use(express.static(__dirname + "/public"));
    app.set('views', __dirname);
    app.set('view engine', 'ejs');
});
app.get('/', function(req, res) {
    res.render('index', { layout: false });
});
app.listen(8080);


const wsServer = new WebSocketServer({
    httpServer: app,
    
    // Firefox 7 alpha has a bug that drops the
    // connection on large fragmented messages
    fragmentOutgoingMessages: false
});

const connections = [];
const canvasCommands = [];

wsServer.on('request', function(request) {
    const connection = request.accept('whiteboard-example', request.origin);
    connections.push(connection);

    console.log(`${connection.remoteAddress} connected - Protocol Version ${connection.webSocketVersion}`);
    
    // Send all the existing canvas commands to the new client
    connection.sendUTF(JSON.stringify({
        msg: "initCommands",
        data: canvasCommands
    }));
    
    // Handle closed connections
    connection.on('close', function() {
        console.log(`${connection.remoteAddress} disconnected`);
        
        const index = connections.indexOf(connection);
        if (index !== -1) {
            // remove the connection from the pool
            connections.splice(index, 1);
        }
    });
    
    // Handle incoming messages
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            try {
                const command = JSON.parse(message.utf8Data);

                if (command.msg === 'clear') {
                    canvasCommands.length = 0; // Clear array without replacing reference
                }
                else {
                    canvasCommands.push(command);
                }

                // rebroadcast command to all clients
                connections.forEach(function(destination) {
                    destination.sendUTF(message.utf8Data);
                });
            }
            catch(e) {
                // do nothing if there's an error.
            }
        }
    });
});

console.log("Whiteboard test app ready");
