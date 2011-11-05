/************************************************************************
 *  Copyright 2010-2011 Worlize Inc.
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

var extend = require('./utils').extend;
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var http = require('http');
var url = require('url');
var crypto = require('crypto');
var WebSocketConnection = require('./WebSocketConnection');

const INIT = -1;
const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

var ID_COUNTER = 0;

var protocolSeparators = [
    "(", ")", "<", ">", "@",
    ",", ";", ":", "\\", "\"",
    "/", "[", "]", "?", "=",
    "{", "}", " ", String.fromCharCode(9)
];

function WebSocketClient(config) {
    // TODO: Implement extensions
    
    this.config = {
        // 1MiB max frame size.
        maxReceivedFrameSize: 0x100000,

        // 8MiB max message size, only applicable if
        // assembleFragments is true
        maxReceivedMessageSize: 0x800000,
        
        // Outgoing messages larger than fragmentationThreshold will be
        // split into multiple fragments.
        fragmentOutgoingMessages: true,
        
        // Outgoing frames are fragmented if they exceed this threshold.
        // Default is 16KiB
        fragmentationThreshold: 0x4000,
        
        // Which version of the protocol to use for this session.  This
        // option will be removed once the protocol is finalized by the IETF
        // It is only available to ease the transition through the
        // intermediate draft protocol versions.
        // At present, it only affects the name of the Origin header.
        websocketVersion: 13,
        
        // If true, fragmented messages will be automatically assembled
        // and the full message will be emitted via a 'message' event.
        // If false, each frame will be emitted via a 'frame' event and
        // the application will be responsible for aggregating multiple
        // fragmented frames.  Single-frame messages will emit a 'message'
        // event in addition to the 'frame' event.
        // Most users will want to leave this set to 'true'
        assembleFragments: true,
        
        // The Nagle Algorithm makes more efficient use of network resources
        // by introducing a small delay before sending small packets so that
        // multiple messages can be batched together before going onto the
        // wire.  This however comes at the cost of latency, so the default
        // is to disable it.  If you don't need low latency and are streaming
        // lots of small messages, you can change this to 'false'
        disableNagleAlgorithm: true,

        // The number of milliseconds to wait after sending a close frame
        // for an acknowledgement to come back before giving up and just
        // closing the socket.
        closeTimeout: 5000
    };
    if (config) {
        extend(this.config, config);
    }
    
    switch (this.config.websocketVersion) {
        case 8:
        case 13:
            break;
        default:
            throw new Error("Requested websocketVersion is not supported. " +
                            "Allowed values are 8 and 13.");
    }
    
    this.readyState = INIT;
};

util.inherits(WebSocketClient, EventEmitter);

WebSocketClient.prototype.connect = function(requestUrl, protocols, origin) {
    var s = this;
    if (typeof(protocols) === 'string') {
        protocols = [protocols];
    }
    if (!(protocols instanceof Array)) {
        protocols = [];
    }
    this.protocols = protocols;
    this.origin = origin;
    
    if (typeof(requestUrl) === 'string') {
        this.url = url.parse(requestUrl);
    }
    else {
        this.url = requestUrl; // in case an already parsed url is passed in.
    }
    if (!this.url.protocol) {
        throw new Error("You must specify a full WebSocket URL, including protocol.");
    }
    if (!this.url.host) {
        throw new Error("You must specify a full WebSocket URL, including hostname.  Relative URLs are not supported.");
    }
    
    this.secure = (this.url.protocol === 'wss:');
    
    // validate protocol characters:
    this.protocols.forEach(function(protocol, index, array) {
        for (var i=0; i < protocol.length; i ++) {
            var charCode = protocol.charCodeAt(i);
            var character = protocol.charAt(i);
            if (charCode < 0x0021 || charCode > 0x007E || protocolSeparators.indexOf(character) !== -1) {
                throw new Error("Protocol list contains invalid character '" + String.fromCharCode(charCode) + "'");
            }
        }
    });

    var defaultPorts = {
        'ws:': '80',
        'wss:': '443'
    };

    if (!this.url.port) {
        this.url.port = defaultPorts[this.url.protocol];
    }
    
    var nonce = new Buffer(16);
    for (var i=0; i < 16; i++) {
        nonce[i] = Math.round(Math.random()*0xFF);
    }
    this.base64nonce = nonce.toString('base64');
    
    var hostHeaderValue = this.url.hostname;
    if ((this.url.protocol === 'ws:' && this.url.port !== '80') ||
        (this.url.protocol === 'wss:' && this.url.port !== '443'))  {
        hostHeaderValue += (":" + this.url.port)
    }
    
    // FIXME: Using old http.createClient interface since Node's new
    // Agent-based API is buggy.
    var client = this.httpClient = http.createClient(this.url.port, this.url.hostname);
    var reqHeaders = {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Version': this.config.websocketVersion.toString(10),
        'Sec-WebSocket-Key': this.base64nonce,
        'Host': hostHeaderValue
    };
    if (this.protocols.length > 0) {
        reqHeaders['Sec-WebSocket-Protocol'] = this.protocols.join(', ');
    }
    if (this.origin) {
        if (this.config.websocketVersion === 13) {
            reqHeaders['Origin'] = this.origin;
        }
        else if (this.config.websocketVersion === 8) {
            reqHeaders['Sec-WebSocket-Origin'] = this.origin;
        }
    }
    // TODO: Implement extensions

    var handleRequestError = function(error) {
        s.emit('connectFailed', error);
    }
    client.on('error', handleRequestError);

    client.on('upgrade', function handleClientUpgrade(response, socket, head) {
        req.removeListener('error', handleRequestError);
        s.socket = socket;
        s.response = response;
        s.firstDataChunk = head;
        s.validateHandshake();
    });

    var pathAndQuery = this.url.pathname;
    if (this.url.search) {
        pathAndQuery += this.url.search;
    }

    var req = this.request = client.request(pathAndQuery, reqHeaders);

    req.on('response', function(response) {
        s.failHandshake("Server responded with a non-101 status: " + response.statusCode);
    });
    
    req.end();
};

WebSocketClient.prototype.validateHandshake = function() {
    var headers = this.response.headers;
    
    if (this.protocols.length > 0) {
        this.protocol = headers['sec-websocket-protocol'];
        if (this.protocol) {
            if (this.protocols.indexOf(this.protocol) === -1) {
                this.failHandshake("Server did not respond with a requested protocol.");
                return;
            }
        }
        else {
            this.failHandshake("Expected a Sec-WebSocket-Protocol header.");
            return;
        }
    }
    
    if (!(headers['connection'] && headers['connection'].toLocaleLowerCase() === 'upgrade')) {
        this.failHandshake("Expected a Connection: Upgrade header from the server");
        return;
    }
    
    if (!(headers['upgrade'] && headers['upgrade'].toLocaleLowerCase() === 'websocket')) {
        this.failHandshake("Expected an Upgrade: websocket header from the server");
        return;
    }
    
    var sha1 = crypto.createHash('sha1');
    sha1.update(this.base64nonce + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    var expectedKey = sha1.digest('base64');
    
    if (!headers['sec-websocket-accept']) {
        this.failHandshake("Expected Sec-WebSocket-Accept header from server")
        return;
    }
    
    if (!(headers['sec-websocket-accept'] === expectedKey)) {
        this.failHandshake("Sec-WebSocket-Accept header from server didn't match expected value of " + expectedKey);
        return;
    }
    
    // TODO: Support extensions
    
    this.succeedHandshake();
};

WebSocketClient.prototype.failHandshake = function(errorDescription) {
    if (this.socket && this.socket.writable) {
        this.socket.end();
    }
    this.emit('connectFailed', errorDescription);
};

WebSocketClient.prototype.succeedHandshake = function() {
    var connection = new WebSocketConnection(this.socket, [], this.protocol, true, this.config);
    connection.websocketVersion = this.config.websocketVersion;
    
    this.emit('connect', connection);
    if (this.firstDataChunk.length > 0) {
        connection.handleSocketData(this.firstDataChunk);
        this.firstDataChunk = null;
    }
};

module.exports = WebSocketClient;