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

var WebSocketClient = require('./WebSocketClient');
var util = require('util');


var wrapper = require('./W3CWebSocketWrapper');
var W3CWebSocketWrapper = wrapper.W3CWebSocketWrapper;
var onConnect = wrapper.onConnect;
var onConnectFailed = wrapper.onConnectFailed;


module.exports = W3CWebSocket;


function W3CWebSocket(url, protocols, origin, headers, requestOptions, clientConfig) {
    W3CWebSocketWrapper.call(this);
    this.addEventListener('close', function(){
      this._client.removeAllListeners();
    });

    // Sanitize clientConfig.
    clientConfig = clientConfig || {};
    clientConfig.assembleFragments = true;  // Required in the W3C API.

    var self = this;

    this._url = url;
    this._protocol = undefined;

    // WebSocketClient instance.
    this._client = new WebSocketClient(clientConfig);

    this._client.on('connect', function(connection) {
        onConnect.call(self, connection);
    });

    this._client.on('connectFailed', function() {
        onConnectFailed.call(self);
    });

    this._client.connect(url, protocols, origin, headers, requestOptions);
}

util.inherits(W3CWebSocket, W3CWebSocketWrapper);
