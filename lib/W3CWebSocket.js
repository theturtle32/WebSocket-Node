/************************************************************************
 *  Copyright 2010-2014 Worlize Inc.
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

var WebSocketClient = require('./WebSocketClient');
var toBuffer = require('typedarray-to-buffer');


const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;


function WebSocket(url, protocols, origin, headers, requestOptions, clientConfig) {
    // Sanitize clientConfig.
    clientConfig = clientConfig || {};
    clientConfig.assembleFragments = true;  // Required in the W3C API.

    // W3C attributes and listeners.
    this._listeners = {
        onopen: undefined,
        onerror: undefined,
        onclose: undefined,
        onmessage: undefined
    };
    this._url = url;
    this._readyState = CONNECTING;
    this._protocol = undefined;
    this._extensions = '';
    this._bufferedAmount = 0;  // Hack, always 0.
    this._binaryType = 'arraybuffer';  // TODO: Should be 'blob' by default, but Node has no Blob.

    // The WebSocketConnection instance.
    this._connection = undefined;

    // WebSocketClient instance.
    this._client = new WebSocketClient(clientConfig);

    this._client.on('connect', onConnect.bind(this));
    this._client.on('connectFailed', onConnectFailed.bind(this));

    this._client.connect(url, protocols, origin, headers, requestOptions);
}


// Expose W3C listener setters/getters.
['onopen', 'onerror', 'onclose', 'onmessage'].forEach(function(method) {
    Object.defineProperty(WebSocket.prototype, method, {
        get: function() {
            return this._listeners[method];
        },
        set: function(listener) {
            if (typeof listener === 'function') {
                this._listeners[method] = listener;
            }
            else {
                this._listeners[method] = undefined;
            }
        }
    });
});


// Expose W3C read only attributes.
Object.defineProperties(WebSocket.prototype, {
    url:            { get: function() { return this._url;            } },
    readyState:     { get: function() { return this._readyState;     } },
    protocol:       { get: function() { return this._protocol;       } },
    extensions:     { get: function() { return this._extensions;     } },
    bufferedAmount: { get: function() { return this._bufferedAmount; } }
});


// Expose W3C write/read attributes.
Object.defineProperties(WebSocket.prototype, {
    binaryType: {
        get: function() {
            return this._binaryType;
        },
        set: function(type) {
            // TODO: Just 'arraybuffer' supported.
            if (type !== 'arraybuffer') {
                throw new SyntaxError('just "blob" type allowed for "binaryType" attribute');
            }
            this._binaryType = type;
        }
    }
});


// Expose W3C readyState constants.
[['CONNECTING',CONNECTING], ['OPEN',OPEN], ['CLOSING',CLOSING], ['CLOSED',CLOSED]].forEach(function(property) {
    Object.defineProperty(WebSocket.prototype, property[0], {
        get: function() { return property[1]; }
    });
});


WebSocket.prototype.send = function(data) {
    if (this._readyState !== OPEN) {
        throw new Error('cannot call send() while not connected');
    }

    // Text.
    if (typeof data === 'string' || data instanceof String) {
        this._connection.sendUTF(data);
    }
    // Binary.
    else {
        // Node Buffer.
        if (data instanceof Buffer) {
            this._connection.sendBytes(data);
        }
        // If ArrayBuffer or ArrayBufferView convert it to Node Buffer.
        else if (data.byteLength || data.byteLength === 0) {
            data = toBuffer(data);
            this._connection.sendBytes(data);
        }
        else {
            throw new Error('unknown binary data:', data);
        }
    }
};


WebSocket.prototype.close = function() {
    switch(this._readyState) {
        case CONNECTING:
            // TODO: We don't have the WebSocketConnection instance yet so no
            // way to close the TCP connection.
            // Artificially invoke the onConnectFailed event.
            onConnectFailed.call(this);
            // And close if it connects after a while.
            this._client.on('connect', function(connection) {
                connection.close();
            });
            break;
        case OPEN:
            this._readyState = CLOSING;
            this._connection.close();
            break;
        case CLOSING:
        case CLOSED:
            break;
    }
};


/**
 * Private API.
 */


function OpenEvent(target) {
  this.type = 'open';
  this.target = target;
}


function ErrorEvent(target) {
  this.type = 'error';
  this.target = target;
}


function CloseEvent(target, code, reason) {
  this.type = 'close';
  this.target = target;
  this.code = code;
  this.reason = reason;
  this.wasClean = (typeof code === 'undefined' || code === 1000);
}


function MessageEvent(target, data) {
  this.type = 'message';
  this.target = target;
  this.data = data;
}


function onConnect(connection) {
    this._readyState = OPEN;
    this._connection = connection;
    this._protocol = connection.protocol;
    this._extensions = connection.extensions;

    this._connection.on('close', onClose.bind(this));
    this._connection.on('message', onMessage.bind(this));

    callListener.call(this, 'onopen', new OpenEvent(this));
}


function onConnectFailed() {
    destroy.call(this);
    this._readyState = CLOSED;

    // Emit 'close' after 'error' even if 'error' listener throws.
    global.setTimeout(function() {
        callListener.call(this, 'onclose', new CloseEvent(this, 1006, 'connection failed'));
    }.bind(this));
    callListener.call(this, 'onerror', new ErrorEvent(this));
}


function onClose(code, reason) {
    destroy.call(this);
    this._readyState = CLOSED;
    
    callListener.call(this, 'onclose', new CloseEvent(this, code, reason || ''));
}


function onMessage(message) {
    if (message.utf8Data) {
        callListener.call(this, 'onmessage', new MessageEvent(this, message.utf8Data));
    }
    else if (message.binaryData) {
        // Must convert from Node Buffer to ArrayBuffer.
        // TODO: or to a Blob (which does not exist in Node!).
        if (this.binaryType === 'arraybuffer') {
            var buffer = message.binaryData;
            var arraybuffer = new ArrayBuffer(buffer.length);
            var view = new Uint8Array(arraybuffer);
            for (var i=0, len=buffer.length; i<len; ++i) {
                view[i] = buffer[i];
            }
            callListener.call(this, 'onmessage', new MessageEvent(this, arraybuffer));
        }
    }
}


function destroy() {
    this._client.removeAllListeners();
    if (this._connection) {
        this._connection.removeAllListeners();
    }
}


function callListener(method, event) {
    var listener = this._listeners[method];
    if (listener) {
        listener(event);
    }
}


module.exports = WebSocket;
