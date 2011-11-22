Changelog
=========

I decided it's time to start maintaining a changelog now, starting with version 1.0.1.

Version 1.0.1
-------------
*Released 2011-11-21*

- Now works with Node 0.6.2 as well as 0.4.12
- Support TLS in WebSocketClient
- Added support for setting and reading cookies
- Added WebSocketServer.prototype.broadcast(data) convenience method
- Added `resourceURL` property to WebSocketRequest objects.  It is a Node URL object with the `resource` and any query string params already parsed.
- The WebSocket request router no longer includes the entire query string when trying to match the path name of the request.
- WebSocketRouterRequest objects now include all the properties and events of WebSocketRequest objects.
- Removed more console.log statements.  Please rely on the various events emitted to be notified of error conditions.  I decided that it is not a library's place to spew information to the console.
- Renamed the `websocketVersion` property to `webSocketVersion` throughout the code to fix inconsistent capitalization.  `websocketVersion` has been kept for compatibility but is deprecated and may be removed in the future.
- Now outputting the sanitized version of custom header names rather than the raw value.  This prevents invalid HTTP from being put onto the wire if given an illegal header name.
