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

const EventEmitter = require('events').EventEmitter;

class WebSocketRouterRequest extends EventEmitter {
  constructor(webSocketRequest, resolvedProtocol) {
    super();

    this.webSocketRequest = webSocketRequest;
    if (resolvedProtocol === '____no_protocol____') {
      this.protocol = null;
    }
    else {
      this.protocol = resolvedProtocol;
    }
    const {
      origin,
      resource,
      resourceURL,
      httpRequest,
      remoteAddress,
      webSocketVersion,
      requestedExtensions,
      cookies
    } = webSocketRequest;

    this.origin = origin;
    this.resource = resource;
    this.resourceURL = resourceURL;
    this.httpRequest = httpRequest;
    this.remoteAddress = remoteAddress;
    this.webSocketVersion = webSocketVersion;
    this.requestedExtensions = requestedExtensions;
    this.cookies = cookies;
  }

  accept(origin, cookies) {
    const connection = this.webSocketRequest.accept(this.protocol, origin, cookies);
    this.emit('requestAccepted', connection);
    return connection;
  }

  reject(status, reason, extraHeaders) {
    this.webSocketRequest.reject(status, reason, extraHeaders);
    this.emit('requestRejected', this);
  }
}

module.exports = WebSocketRouterRequest;
