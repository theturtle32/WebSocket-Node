Changelog
=========

Version 1.0.9
-------------
* Fixing an insidious corner-case bug that prevented `WebSocketConnection` from firing the `close` event in certain cases when there was an error on the underlying `Socket`, leading to connections sticking around forever, stuck erroneously in the `connected` state.  These "ghost" connections would cause an error event when trying to write to them.
* Removed deprecated `websocketVersion` property.  Use `webSocketVersion` instead (case difference).
* Allowing user to specify all properties for `tlsOptions` in WebSocketClient, not just a few whitelisted properties.  This keeps us from having to constantly add new config properties for new versions of Node. (Thanks, [jesusprubio](https://github.com/jesusprubio))
* Removing support for Node 0.4.x and 0.6.x.
* Adding `fuzzingclient.json` spec file for the Autobahn Test Suite.
* Now more fairly emitting `message` events from the `WebSocketConnection`.  Previously, all buffered frames for a connection would be processed and all `message` events emitted before moving on to processing the next connection with available data.  Now We process one frame per connection (most of the time) in a more fair round-robin fashion.
* Now correctly calling the `EventEmitter` superclass constructor during class instance initialization.
* `WebSocketClient.prototype.connect` now accepts the empty string (`''`) to mean "no subprotocol requested."  Previously either `null` or an empty array (`[]`) was required.
* Fixing a `TypeError` bug in `WebSocketRouter` (Thanks, [a0000778](https://github.com/a0000778))
* Fixing a potential race condition when attaching event listeners to the underlying `Socket`. (Thanks [RichardBsolut](https://github.com/RichardBsolut))
* `WebSocketClient` now accepts an optional options hash to be passed to `(http|https).request`. (Thanks [mildred](https://github.com/mildred) and [aus](https://github.com/aus))  This enables the following new abilities, amongst others:
  * Use WebSocket-Node from behind HTTP/HTTPS proxy servers using [koichik/node-tunnel](https://github.com/koichik/node-tunnel) or similar.
  * Specify the local port and local address to bind the outgoing request socket to.
* Adding option to ignore `X-Forwarded-For` headers when accepting connections from untrusted clients.
* Adding ability to mount a `WebSocketServer` instance to an arbitrary number of Node http/https servers.
* Adding browser shim so Browserify won't blow up when trying to package up code that uses WebSocket-Node.  The shim is a no-op, it ***does not implement a wrapper*** providing the WebSocket-Node API in the browser.
* Incorporating upstream enhancements for the native C++ UTF-8 validation and xor masking functions. (Thanks [einaros](https://github.com/einaros) and [kkoopa](https://github.com/kkoopa))


Version 1.0.8
-------------
*Released 2012-12-26*

* Fixed remaining naming inconsistency of "websocketVersion" as opposed to "webSocketVersion" throughout the code, and added deprecation warnings for use of the old casing throughout.
* Fixed an issue with our case-insensitive handling of WebSocket subprotocols.  Clients that requested a mixed-case subprotocol would end up failing the connection when the server accepted the connection, returning a lower-case version of the subprotocol name.  Now we return the subprotocol name in the exact casing that was requested by the client, while still maintaining the case-insensitive verification logic for convenience and practicality.
* Making sure that any socket-level activity timeout that may have been set on a TCP socket is removed when initializing a connection.
* Added support for native TCP Keep-Alive instead of using the WebSocket ping/pong packets to serve that function.
* Fixed cookie parsing to be compliant with RFC 2109

Version 1.0.7
-------------
*Released 2012-08-12*

* ***Native modules are now optional!*** If they fail to compile, WebSocket-Node will still work but will not verify that received UTF-8 data is valid, and xor masking/unmasking of payload data for security purposes will not be as efficient as it is performed in JavaScript instead of native code.
* Reduced Node.JS version requirement back to v0.6.10

Version 1.0.6
-------------
*Released 2012-05-22*

* Now requires Node v0.6.13 since that's the first version that I can manage to successfully build the native UTF-8 validator with node-gyp through npm.

Version 1.0.5
-------------
*Released 2012-05-21*

* Fixes the issues that users were having building the native UTF-8 validator on Windows platforms.  Special Thanks to:
  * [zerodivisi0n](https://github.com/zerodivisi0n)
  * [andreasbotsikas](https://github.com/andreasbotsikas)
* Fixed accidental global variable usage (Thanks, [hakobera](https://github.com/hakobera)!)
* Added callbacks to the send* methods that provide notification of messages being sent on the wire and any socket errors that may occur when sending a message. (Thanks, [zerodivisi0n](https://github.com/zerodivisi0n)!)
* Added option to disable logging in the echo-server in the test folder (Thanks, [oberstet](https://github.com/oberstet)!)


Version 1.0.4
-------------
*Released 2011-12-18*

* Now validates that incoming UTF-8 messages do, in fact, contain valid UTF-8 data.  The connection is dropped with prejudice if invalid data is received.  This strict behavior conforms to the WebSocket RFC and is verified by the Autobahn Test Suite.  This is accomplished in a performant way by using a native C++ Node module created by [einaros](https://github.com/einaros).
* Updated handling of connection closure to pass more of the Autobahn Test Suite.

Version 1.0.3
-------------
*Released 2011-12-18*

* Substantial speed increase (~150% on my machine, depending on the circumstances) due to an optimization in FastBufferList.js that drastically reduces the number of memory alloctions and buffer copying. ([kazuyukitanimura](https://github.com/kazuyukitanimura))


Version 1.0.2
-------------
*Released 2011-11-28*

* Fixing whiteboard example to work under Node 0.6.x ([theturtle32](https://github.com/theturtle32))
* Now correctly emitting a `close` event with a 1006 error code if there is a TCP error while writing to the socket during the handshake. ([theturtle32](https://github.com/theturtle32))
* Catching errors when writing to the TCP socket during the handshake. ([justoneplanet](https://github.com/justoneplanet))
* No longer outputting console.warn messages when there is an error writing to the TCP socket ([justoneplanet](https://github.com/justoneplanet))
* Fixing some formatting errors, commas, semicolons, etc.  ([kaisellgren](https://github.com/kaisellgren))


Version 1.0.1
-------------
*Released 2011-11-21*

* Now works with Node 0.6.2 as well as 0.4.12
* Support TLS in WebSocketClient
* Added support for setting and reading cookies
* Added WebSocketServer.prototype.broadcast(data) convenience method
* Added `resourceURL` property to WebSocketRequest objects.  It is a Node URL object with the `resource` and any query string params already parsed.
* The WebSocket request router no longer includes the entire query string when trying to match the path name of the request.
* WebSocketRouterRequest objects now include all the properties and events of WebSocketRequest objects.
* Removed more console.log statements.  Please rely on the various events emitted to be notified of error conditions.  I decided that it is not a library's place to spew information to the console.
* Renamed the `websocketVersion` property to `webSocketVersion` throughout the code to fix inconsistent capitalization.  `websocketVersion` has been kept for compatibility but is deprecated and may be removed in the future.
* Now outputting the sanitized version of custom header names rather than the raw value.  This prevents invalid HTTP from being put onto the wire if given an illegal header name.


I decided it's time to start maintaining a changelog now, starting with version 1.0.1.
