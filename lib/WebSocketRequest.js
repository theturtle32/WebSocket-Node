var crypto = require('crypto');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocketConnection = require('./WebSocketConnection');

var headerValueSplitRegExp = /,\s*/;
var headerParamSplitRegExp = /;\s*/;
var headerSanitizeRegExp = /[\r\n]/g;
var protocolSeparators = [
	"(", ")", "<", ">", "@",
	",", ";", ":", "\\", "\"",
	"/", "[", "]", "?", "=",
	"{", "}", " ", String.fromCharCode(9)
];

var httpStatusDescriptions = {
    100: "Continue",
    101: "Switching Protocols",
    200: "OK",
    201: "Created",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    307: "Temporary Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    406: "Not Acceptable",
    407: "Proxy Authorization Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Request Entity Too Long",
    414: "Request-URI Too Long",
    415: "Unsupported Media Type",
    416: "Requested Range Not Satisfiable",
    417: "Expectation Failed",
    426: "Upgrade Required",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported"
};

function WebSocketRequest(socket, httpRequest, serverConfig) {
    this.socket = socket;
    this.httpRequest = httpRequest;
    this.resource = httpRequest.url;
    this.remoteAddress = socket.remoteAddress;
    this.serverConfig = serverConfig;
    this.readHandshake(httpRequest);
};

util.inherits(WebSocketRequest, EventEmitter);

WebSocketRequest.prototype.readHandshake = function(request) {
    this.host = request.headers['host'];
    if (!this.host) {
        throw new Error("Client must provide a Host header.");
    }
    
    this.key = request.headers['sec-websocket-key'];
    if (!this.key) {
        this.reject(400, "Client must provide a value for Sec-WebSocket-Key.");
        throw new Error("Client must provide a value for Sec-WebSocket-Key.");
    }
    
    this.origin = request.headers['sec-websocket-origin'];
    
    this.websocketVersion = request.headers['sec-websocket-version'];
    if (!this.websocketVersion) {
        this.reject(400, "Client must provide a value for Sec-WebSocket-Version.");
        throw new Error("Client must provide a value for Sec-WebSocket-Version.");
    }
    if (this.websocketVersion !== '8') {
        this.reject(426, "Unsupported websocket client version.", {
            "Sec-WebSocket-Version": "8"
        });
        throw new Error("Unsupported websocket client version.  Client requested version " + this.websocketVersion + ", but we only support version 8.");
    }
    
    // Protocol is optional.
    var protocolString = request.headers['sec-websocket-protocol'];
    if (protocolString) {
        this.requestedProtocols = protocolString.toLocaleLowerCase().split(headerValueSplitRegExp);
    }
    else {
        this.requestedProtocols = [];
    }
    
    if (request.headers['x-forwarded-for']) {
        this.remoteAddress = request.headers['x-forwarded-for'].split(', ')[0];
    }
    
    // Extensions are optional.
    var extensionsString = request.headers['sec-websocket-extensions'];
    this.requestedExtensions = this.parseExtensions(extensionsString);
};

WebSocketRequest.prototype.parseExtensions = function(extensionsString) {
    if (!extensionsString || extensionsString.length === 0) {
        return [];
    }
    extensions = extensionsString.toLocaleLowerCase().split(headerValueSplitRegExp);
    extensions.forEach(function(extension, index, array) {
        var params = extension.split(headerParamSplitRegExp);
        var extensionName = params[0];
        var extensionParams = params.slice(1);
        extensionParams.forEach(function(rawParam, index, array) {
            var arr = rawParam.split('=');
            var obj = {
                name: arr[0],
                value: arr[1]
            };
            array.splice(index, 1, obj);
        });
        var obj = {
            name: extensionName,
            params: extensionParams
        };
        array.splice(index, 1, obj);
    });
    return extensions;
},
WebSocketRequest.prototype.accept = function(acceptedProtocol, allowedOrigin) {
    // TODO: Handle extensions
    var connection = new WebSocketConnection(this.socket, [], acceptedProtocol, false, this.serverConfig);
    
    connection.remoteAddress = this.remoteAddress;
    
    // Create key validation hash
    var sha1 = crypto.createHash('sha1');
    sha1.update(this.key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    var acceptKey = sha1.digest('base64');
    
    var response = "HTTP/1.1 101 Switching Protocols\r\n" +
                   "Upgrade: websocket\r\n" +
                   "Connection: Upgrade\r\n" +
                   "Sec-WebSocket-Accept: " + acceptKey + "\r\n";
    if (acceptedProtocol) {
        // validate protocol
		for (var i=0; i < acceptedProtocol.length; i++) {
			var charCode = acceptedProtocol.charCodeAt(i);
			var character = acceptedProtocol.charAt(i);
			if (charCode < 0x21 || charCode > 0x7E || protocolSeparators.indexOf(character) !== -1) {
			    this.reject(500);
				throw new Error("Illegal character '" + String.fromCharCode(character) + "' in subprotocol.");
			}
		}
		if (this.requestedProtocols.indexOf(acceptedProtocol) === -1) {
		    this.reject(500);
		    throw new Error("Specified protocol was not requested by the client.");
		}
		
        acceptedProtocol = acceptedProtocol.replace(headerSanitizeRegExp, '');
        response += "Sec-WebSocket-Protocol: " + acceptedProtocol + "\r\n";
    }
    if (allowedOrigin) {
        allowedOrigin = allowedOrigin.replace(headerSanitizeRegExp, '');
        response += "Sec-WebSocket-Origin: " + allowedOrigin + "\r\n";
    }
    // TODO: handle negotiated extensions
    // if (negotiatedExtensions) {
    //     response += "Sec-WebSocket-Extensions: " + negotiatedExtensions.join(", ") + "\r\n";
    // }
    response += "\r\n";
    
    this.socket.write(response, 'ascii');
    
    this.emit('requestAccepted', connection);
    
    return connection;
};

WebSocketRequest.prototype.reject = function(status, reason, extraHeaders) {
    if (typeof(status) !== 'number') {
        status = 403;
    }
    var response = "HTTP/1.1 " + status + " " + httpStatusDescriptions[status] + "\r\n" +
                   "Connection: close\r\n";
    if (reason) {
        reason = reason.replace(headerSanitizeRegExp, '');
        response += "X-WebSocket-Reject-Reason: " + reason + "\r\n";
    }
    
    if (extraHeaders) {
        for (var key in extraHeaders) {
            var sanitizedValue = extraHeaders[key].toString().replace(headerSanitizeRegExp, '');
            var sanitizedKey = key.replace(headerSanitizeRegExp, '');
            response += (key + ": " + sanitizedValue + "\r\n");
        }
    }
    
    response += "\r\n";
    this.socket.end(response, 'ascii');
    
    this.emit('requestRejected', this);
};

module.exports = WebSocketRequest;