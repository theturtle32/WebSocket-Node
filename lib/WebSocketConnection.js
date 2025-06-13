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

const utils = require('./utils');
const EventEmitter = require('events').EventEmitter;
const WebSocketFrame = require('./WebSocketFrame');
const BufferList = require('../vendor/FastBufferList');
const isValidUTF8 = require('utf-8-validate');
const bufferAllocUnsafe = utils.bufferAllocUnsafe;
const bufferFromString = utils.bufferFromString;

// Connected, fully-open, ready to send and receive frames
const STATE_OPEN = 'open';
// Received a close frame from the remote peer
const STATE_PEER_REQUESTED_CLOSE = 'peer_requested_close';
// Sent close frame to remote peer.  No further data can be sent.
const STATE_ENDING = 'ending';
// Connection is fully closed.  No further data can be sent or received.
const STATE_CLOSED = 'closed';

const setImmediateImpl = ('setImmediate' in global) ?
  global.setImmediate.bind(global) :
  process.nextTick.bind(process);

let idCounter = 0;

function validateCloseReason(code) {
  if (code < 1000) {
    // Status codes in the range 0-999 are not used
    return false;
  }
  if (code >= 1000 && code <= 2999) {
    // Codes from 1000 - 2999 are reserved for use by the protocol.  Only
    // a few codes are defined, all others are currently illegal.
    return [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015].indexOf(code) !== -1;
  }
  if (code >= 3000 && code <= 3999) {
    // Reserved for use by libraries, frameworks, and applications.
    // Should be registered with IANA.  Interpretation of these codes is
    // undefined by the WebSocket protocol.
    return true;
  }
  if (code >= 4000 && code <= 4999) {
    // Reserved for private use.  Interpretation of these codes is
    // undefined by the WebSocket protocol.
    return true;
  }
  if (code >= 5000) {
    return false;
  }
}

class WebSocketConnection extends EventEmitter {
  constructor(socket, extensions, protocol, maskOutgoingPackets, config) {
    super();
        
    this._debug = utils.BufferingLogger('websocket:connection', ++idCounter);
    this._debug('constructor');
        
    if (this._debug.enabled) {
      instrumentSocketForDebugging(this, socket);
    }
        
    this._pingListenerCount = 0;
    this.on('newListener', (ev) => {
      if (ev === 'ping'){
        this._pingListenerCount++;
      }
    }).on('removeListener', (ev) => {
      if (ev === 'ping') {
        this._pingListenerCount--;
      }
    });

    this.config = config;
    this.socket = socket;
    this.protocol = protocol;
    this.extensions = extensions;
    this.remoteAddress = socket.remoteAddress;
    this.closeReasonCode = -1;
    this.closeDescription = null;
    this.closeEventEmitted = false;

    // We have to mask outgoing packets if we're acting as a WebSocket client.
    this.maskOutgoingPackets = maskOutgoingPackets;

    // We re-use the same buffers for the mask and frame header for all frames
    // received on each connection to avoid a small memory allocation for each
    // frame.
    this.maskBytes = bufferAllocUnsafe(4);
    this.frameHeader = bufferAllocUnsafe(10);

    // the BufferList will handle the data streaming in
    this.bufferList = new BufferList();

    // Prepare for receiving first frame
    this.currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    this.fragmentationSize = 0; // data received so far...
    this.frameQueue = [];
        
    // Various bits of connection state
    this.connected = true;
    this.state = STATE_OPEN;
    this.waitingForCloseResponse = false;
    // Received TCP FIN, socket's readable stream is finished.
    this.receivedEnd = false;

    this.closeTimeout = this.config.closeTimeout;
    this.assembleFragments = this.config.assembleFragments;
    this.maxReceivedMessageSize = this.config.maxReceivedMessageSize;

    this.outputBufferFull = false;
    this.inputPaused = false;
    this.receivedDataHandler = this.processReceivedData.bind(this);
    this._closeTimerHandler = this.handleCloseTimer.bind(this);

    // Disable nagle algorithm?
    this.socket.setNoDelay(this.config.disableNagleAlgorithm);

    // Make sure there is no socket inactivity timeout
    this.socket.setTimeout(0);

    if (this.config.keepalive && !this.config.useNativeKeepalive) {
      if (typeof(this.config.keepaliveInterval) !== 'number') {
        throw new Error('keepaliveInterval must be specified and numeric if keepalive is true.');
      }
      this._keepaliveTimerHandler = this.handleKeepaliveTimer.bind(this);
      this.setKeepaliveTimer();

      if (this.config.dropConnectionOnKeepaliveTimeout) {
        if (typeof(this.config.keepaliveGracePeriod) !== 'number') {
          throw new Error('keepaliveGracePeriod  must be specified and numeric if dropConnectionOnKeepaliveTimeout is true.');
        }
        this._gracePeriodTimerHandler = this.handleGracePeriodTimer.bind(this);
      }
    }
    else if (this.config.keepalive && this.config.useNativeKeepalive) {
      if (!('setKeepAlive' in this.socket)) {
        throw new Error('Unable to use native keepalive: unsupported by this version of Node.');
      }
      this.socket.setKeepAlive(true, this.config.keepaliveInterval);
    }
        
    // The HTTP Client seems to subscribe to socket error events
    // and re-dispatch them in such a way that doesn't make sense
    // for users of our client, so we want to make sure nobody
    // else is listening for error events on the socket besides us.
    this.socket.removeAllListeners('error');
  }

  _addSocketEventListeners() {
    this.socket.on('error', this.handleSocketError.bind(this));
    this.socket.on('end', this.handleSocketEnd.bind(this));
    this.socket.on('close', this.handleSocketClose.bind(this));
    this.socket.on('drain', this.handleSocketDrain.bind(this));
    this.socket.on('pause', this.handleSocketPause.bind(this));
    this.socket.on('resume', this.handleSocketResume.bind(this));
    this.socket.on('data', this.handleSocketData.bind(this));
  }

  // set or reset the keepalive timer when data is received.
  setKeepaliveTimer() {
    this._debug('setKeepaliveTimer');
    if (!this.config.keepalive  || this.config.useNativeKeepalive) { return; }
    this.clearKeepaliveTimer();
    this.clearGracePeriodTimer();
    this._keepaliveTimeoutID = setTimeout(this._keepaliveTimerHandler, this.config.keepaliveInterval);
  }

  clearKeepaliveTimer() {
    if (this._keepaliveTimeoutID) {
      clearTimeout(this._keepaliveTimeoutID);
    }
  }

  // No data has been received within config.keepaliveTimeout ms.
  handleKeepaliveTimer() {
    this._debug('handleKeepaliveTimer');
    this._keepaliveTimeoutID = null;
    this.ping();

    // If we are configured to drop connections if the client doesn't respond
    // then set the grace period timer.
    if (this.config.dropConnectionOnKeepaliveTimeout) {
      this.setGracePeriodTimer();
    }
    else {
      // Otherwise reset the keepalive timer to send the next ping.
      this.setKeepaliveTimer();
    }
  }

  setGracePeriodTimer() {
    this._debug('setGracePeriodTimer');
    this.clearGracePeriodTimer();
    this._gracePeriodTimeoutID = setTimeout(this._gracePeriodTimerHandler, this.config.keepaliveGracePeriod);
  }

  clearGracePeriodTimer() {
    if (this._gracePeriodTimeoutID) {
      clearTimeout(this._gracePeriodTimeoutID);
    }
  }

  handleGracePeriodTimer() {
    this._debug('handleGracePeriodTimer');
    // If this is called, the client has not responded and is assumed dead.
    this._gracePeriodTimeoutID = null;
    this.drop(WebSocketConnection.CLOSE_REASON_ABNORMAL, 'Peer not responding.', true);
  }

  handleSocketData(data) {
    this._debug('handleSocketData');
    // Reset the keepalive timer when receiving data of any kind.
    this.setKeepaliveTimer();

    // Add received data to our bufferList, which efficiently holds received
    // data chunks in a linked list of Buffer objects.
    this.bufferList.write(data);

    this.processReceivedData();
  }

  processReceivedData() {
    this._debug('processReceivedData');
    // If we're not connected, we should ignore any data remaining on the buffer.
    if (!this.connected) { return; }

    // Receiving/parsing is expected to be halted when paused.
    if (this.inputPaused) { return; }

    var frame = this.currentFrame;

    // WebSocketFrame.prototype.addData returns true if all data necessary to
    // parse the frame was available.  It returns false if we are waiting for
    // more data to come in on the wire.
    if (!frame.addData(this.bufferList)) { this._debug('-- insufficient data for frame'); return; }

    var self = this;

    // Handle possible parsing errors
    if (frame.protocolError) {
      // Something bad happened.. get rid of this client.
      this._debug('-- protocol error');
      process.nextTick(() => {
        this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR, frame.dropReason);
      });
      return;
    }
    else if (frame.frameTooLarge) {
      this._debug('-- frame too large');
      process.nextTick(() => {
        this.drop(WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG, frame.dropReason);
      });
      return;
    }

    // For now since we don't support extensions, all RSV bits are illegal
    if (frame.rsv1 || frame.rsv2 || frame.rsv3) {
      this._debug('-- illegal rsv flag');
      process.nextTick(() => {
        this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
          'Unsupported usage of rsv bits without negotiated extension.');
      });
      return;
    }

    if (!this.assembleFragments) {
      this._debug('-- emitting frame');
      process.nextTick(function() { self.emit('frame', frame); });
    }

    process.nextTick(function() { self.processFrame(frame); });
        
    this.currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);

    // If there's data remaining, schedule additional processing, but yield
    // for now so that other connections have a chance to have their data
    // processed.  We use setImmediate here instead of process.nextTick to
    // explicitly indicate that we wish for other I/O to be handled first.
    if (this.bufferList.length > 0) {
      setImmediateImpl(this.receivedDataHandler);
    }
  }

  handleSocketError(error) {
    this._debug('handleSocketError: %j', error);
    if (this.state === STATE_CLOSED) {
      // See https://github.com/theturtle32/WebSocket-Node/issues/288
      this._debug('  --- Socket \'error\' after \'close\'');
      return;
    }
    this.closeReasonCode = WebSocketConnection.CLOSE_REASON_ABNORMAL;
    this.closeDescription = `Socket Error: ${error.syscall} ${error.code}`;
    this.connected = false;
    this.state = STATE_CLOSED;
    this.fragmentationSize = 0;
    if (utils.eventEmitterListenerCount(this, 'error') > 0) {
      this.emit('error', error);
    }
    this.socket.destroy();
    this._debug.printOutput();
  }

  handleSocketEnd() {
    this._debug('handleSocketEnd: received socket end.  state = %s', this.state);
    this.receivedEnd = true;
    if (this.state === STATE_CLOSED) {
      // When using the TLS module, sometimes the socket will emit 'end'
      // after it emits 'close'.  I don't think that's correct behavior,
      // but we should deal with it gracefully by ignoring it.
      this._debug('  --- Socket \'end\' after \'close\'');
      return;
    }
    if (this.state !== STATE_PEER_REQUESTED_CLOSE &&
            this.state !== STATE_ENDING) {
      this._debug('  --- UNEXPECTED socket end.');
      this.socket.end();
    }
  }

  handleSocketClose(hadError) {
    this._debug('handleSocketClose: received socket close');
    this.socketHadError = hadError;
    this.connected = false;
    this.state = STATE_CLOSED;
    // If closeReasonCode is still set to -1 at this point then we must
    // not have received a close frame!!
    if (this.closeReasonCode === -1) {
      this.closeReasonCode = WebSocketConnection.CLOSE_REASON_ABNORMAL;
      this.closeDescription = 'Connection dropped by remote peer.';
    }
    this.clearCloseTimer();
    this.clearKeepaliveTimer();
    this.clearGracePeriodTimer();
    if (!this.closeEventEmitted) {
      this.closeEventEmitted = true;
      this._debug('-- Emitting WebSocketConnection close event');
      this.emit('close', this.closeReasonCode, this.closeDescription);
    }
  }

  handleSocketDrain() {
    this._debug('handleSocketDrain: socket drain event');
    this.outputBufferFull = false;
    this.emit('drain');
  }

  handleSocketPause() {
    this._debug('handleSocketPause: socket pause event');
    this.inputPaused = true;
    this.emit('pause');
  }

  handleSocketResume() {
    this._debug('handleSocketResume: socket resume event');
    this.inputPaused = false;
    this.emit('resume');
    this.processReceivedData();
  }

  pause() {
    this._debug('pause: pause requested');
    this.socket.pause();
  }

  resume() {
    this._debug('resume: resume requested');
    this.socket.resume();
  }

  close(reasonCode, description) {
    if (this.connected) {
      this._debug('close: Initating clean WebSocket close sequence.');
      if ('number' !== typeof reasonCode) {
        reasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
      }
      if (!validateCloseReason(reasonCode)) {
        throw new Error(`Close code ${reasonCode} is not valid.`);
      }
      if ('string' !== typeof description) {
        description = WebSocketConnection.CLOSE_DESCRIPTIONS[reasonCode];
      }
      this.closeReasonCode = reasonCode;
      this.closeDescription = description;
      this.setCloseTimer();
      this.sendCloseFrame(this.closeReasonCode, this.closeDescription);
      this.state = STATE_ENDING;
      this.connected = false;
    }
  }

  drop(reasonCode, description, skipCloseFrame) {
    this._debug('drop');
    if (typeof(reasonCode) !== 'number') {
      reasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
    }

    if (typeof(description) !== 'string') {
      // If no description is provided, try to look one up based on the
      // specified reasonCode.
      description = WebSocketConnection.CLOSE_DESCRIPTIONS[reasonCode];
    }

    this._debug('Forcefully dropping connection. skipCloseFrame: %s, code: %d, description: %s',
      skipCloseFrame, reasonCode, description
    );

    this.closeReasonCode = reasonCode;
    this.closeDescription = description;
    this.frameQueue = [];
    this.fragmentationSize = 0;
    if (!skipCloseFrame) {
      this.sendCloseFrame(reasonCode, description);
    }
    this.connected = false;
    this.state = STATE_CLOSED;
    this.clearCloseTimer();
    this.clearKeepaliveTimer();
    this.clearGracePeriodTimer();

    if (!this.closeEventEmitted) {
      this.closeEventEmitted = true;
      this._debug('Emitting WebSocketConnection close event');
      this.emit('close', this.closeReasonCode, this.closeDescription);
    }
        
    this._debug('Drop: destroying socket');
    this.socket.destroy();
  }

  setCloseTimer() {
    this._debug('setCloseTimer');
    this.clearCloseTimer();
    this._debug('Setting close timer');
    this.waitingForCloseResponse = true;
    this.closeTimer = setTimeout(this._closeTimerHandler, this.closeTimeout);
  }

  clearCloseTimer() {
    this._debug('clearCloseTimer');
    if (this.closeTimer) {
      this._debug('Clearing close timer');
      clearTimeout(this.closeTimer);
      this.waitingForCloseResponse = false;
      this.closeTimer = null;
    }
  }

  handleCloseTimer() {
    this._debug('handleCloseTimer');
    this.closeTimer = null;
    if (this.waitingForCloseResponse) {
      this._debug('Close response not received from client.  Forcing socket end.');
      this.waitingForCloseResponse = false;
      this.state = STATE_CLOSED;
      this.socket.end();
    }
  }

  processFrame(frame) {
    this._debug('processFrame');
    this._debug(' -- frame: %s', frame);
        
    // Any non-control opcode besides 0x00 (continuation) received in the
    // middle of a fragmented message is illegal.
    if (this.frameQueue.length !== 0 && (frame.opcode > 0x00 && frame.opcode < 0x08)) {
      this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
        `Illegal frame opcode 0x${frame.opcode.toString(16)} received in middle of fragmented message.`);
      return;
    }

    switch(frame.opcode) {
    case 0x02: // WebSocketFrame.BINARY_FRAME
      this._debug('-- Binary Frame');
      if (this.assembleFragments) {
        if (frame.fin) {
          // Complete single-frame message received
          this._debug('---- Emitting \'message\' event');
          this.emit('message', {
            type: 'binary',
            binaryData: frame.binaryPayload
          });
        }
        else {
          // beginning of a fragmented message
          this.frameQueue.push(frame);
          this.fragmentationSize = frame.length;
        }
      }
      break;
    case 0x01: // WebSocketFrame.TEXT_FRAME
      this._debug('-- Text Frame');
      if (this.assembleFragments) {
        if (frame.fin) {
          if (!isValidUTF8(frame.binaryPayload)) {
            this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA,
              'Invalid UTF-8 Data Received');
            return;
          }
          // Complete single-frame message received
          this._debug('---- Emitting \'message\' event');
          this.emit('message', {
            type: 'utf8',
            utf8Data: frame.binaryPayload.toString('utf8')
          });
        }
        else {
          // beginning of a fragmented message
          this.frameQueue.push(frame);
          this.fragmentationSize = frame.length;
        }
      }
      break;
    case 0x00: // WebSocketFrame.CONTINUATION
      this._debug('-- Continuation Frame');
      if (this.assembleFragments) {
        if (this.frameQueue.length === 0) {
          this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
            'Unexpected Continuation Frame');
          return;
        }

        this.fragmentationSize += frame.length;

        if (this.fragmentationSize > this.maxReceivedMessageSize) {
          this.drop(WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG,
            'Maximum message size exceeded.');
          return;
        }

        this.frameQueue.push(frame);

        if (frame.fin) {
          // end of fragmented message, so we process the whole
          // message now.  We also have to decode the utf-8 data
          // for text frames after combining all the fragments.
          var bytesCopied = 0;
          var binaryPayload = bufferAllocUnsafe(this.fragmentationSize);
          const { opcode } = this.frameQueue[0];
          this.frameQueue.forEach((currentFrame) => {
            currentFrame.binaryPayload.copy(binaryPayload, bytesCopied);
            bytesCopied += currentFrame.binaryPayload.length;
          });
          this.frameQueue = [];
          this.fragmentationSize = 0;

          switch (opcode) {
          case 0x02: // WebSocketOpcode.BINARY_FRAME
            this.emit('message', {
              type: 'binary',
              binaryData: binaryPayload
            });
            break;
          case 0x01: // WebSocketOpcode.TEXT_FRAME
            if (!isValidUTF8(binaryPayload)) {
              this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA,
                'Invalid UTF-8 Data Received');
              return;
            }
            this.emit('message', {
              type: 'utf8',
              utf8Data: binaryPayload.toString('utf8')
            });
            break;
          default:
            this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
              `Unexpected first opcode in fragmentation sequence: 0x${opcode.toString(16)}`);
            return;
          }
        }
      }
      break;
    case 0x09: // WebSocketFrame.PING
      this._debug('-- Ping Frame');

      if (this._pingListenerCount > 0) {
        // logic to emit the ping frame: this is only done when a listener is known to exist
        // Expose a function allowing the user to override the default ping() behavior
        var cancelled = false;
        const cancel = () => {
          cancelled = true;
        };
        this.emit('ping', cancel, frame.binaryPayload);

        // Only send a pong if the client did not indicate that he would like to cancel
        if (!cancelled) {
          this.pong(frame.binaryPayload);
        }
      }
      else {
        this.pong(frame.binaryPayload);
      }

      break;
    case 0x0A: // WebSocketFrame.PONG
      this._debug('-- Pong Frame');
      this.emit('pong', frame.binaryPayload);
      break;
    case 0x08: // WebSocketFrame.CONNECTION_CLOSE
      this._debug('-- Close Frame');
      if (this.waitingForCloseResponse) {
        // Got response to our request to close the connection.
        // Close is complete, so we just hang up.
        this._debug('---- Got close response from peer.  Completing closing handshake.');
        this.clearCloseTimer();
        this.waitingForCloseResponse = false;
        this.state = STATE_CLOSED;
        this.socket.end();
        return;
      }
                
      this._debug('---- Closing handshake initiated by peer.');
      // Got request from other party to close connection.
      // Send back acknowledgement and then hang up.
      this.state = STATE_PEER_REQUESTED_CLOSE;
      var respondCloseReasonCode;

      // Make sure the close reason provided is legal according to
      // the protocol spec.  Providing no close status is legal.
      // WebSocketFrame sets closeStatus to -1 by default, so if it
      // is still -1, then no status was provided.
      if (frame.invalidCloseFrameLength) {
        this.closeReasonCode = 1005; // 1005 = No reason provided.
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
      }
      else if (frame.closeStatus === -1 || validateCloseReason(frame.closeStatus)) {
        this.closeReasonCode = frame.closeStatus;
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
      }
      else {
        this.closeReasonCode = frame.closeStatus;
        respondCloseReasonCode = WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR;
      }
                
      // If there is a textual description in the close frame, extract it.
      if (frame.binaryPayload.length > 1) {
        if (!isValidUTF8(frame.binaryPayload)) {
          this.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA,
            'Invalid UTF-8 Data Received');
          return;
        }
        this.closeDescription = frame.binaryPayload.toString('utf8');
      }
      else {
        this.closeDescription = WebSocketConnection.CLOSE_DESCRIPTIONS[this.closeReasonCode];
      }
      this._debug(
        '------ Remote peer %s - code: %d - %s - close frame payload length: %d',
        this.remoteAddress, this.closeReasonCode,
        this.closeDescription, frame.length
      );
      this._debug('------ responding to remote peer\'s close request.');
      this.sendCloseFrame(respondCloseReasonCode, null);
      this.connected = false;
      break;
    default:
      this._debug('-- Unrecognized Opcode %d', frame.opcode);
      this.drop(WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR,
        `Unrecognized Opcode: 0x${frame.opcode.toString(16)}`);
      break;
    }
  }

  send(data, cb) {
    this._debug('send');
    if (Buffer.isBuffer(data)) {
      this.sendBytes(data, cb);
    }
    else if (typeof(data['toString']) === 'function') {
      this.sendUTF(data, cb);
    }
    else {
      throw new Error('Data provided must either be a Node Buffer or implement toString()');
    }
  }

  sendUTF(data, cb) {
    data = bufferFromString(data.toString(), 'utf8');
    this._debug('sendUTF: %d bytes', data.length);
    var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    frame.opcode = 0x01; // WebSocketOpcode.TEXT_FRAME
    frame.binaryPayload = data;
    this.fragmentAndSend(frame, cb);
  }

  sendBytes(data, cb) {
    this._debug('sendBytes');
    if (!Buffer.isBuffer(data)) {
      throw new Error('You must pass a Node Buffer object to WebSocketConnection.prototype.sendBytes()');
    }
    var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    frame.opcode = 0x02; // WebSocketOpcode.BINARY_FRAME
    frame.binaryPayload = data;
    this.fragmentAndSend(frame, cb);
  }

  ping(data) {
    this._debug('ping');
    var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    frame.opcode = 0x09; // WebSocketOpcode.PING
    frame.fin = true;
    if (data) {
      if (!Buffer.isBuffer(data)) {
        data = bufferFromString(data.toString(), 'utf8');
      }
      if (data.length > 125) {
        this._debug('WebSocket: Data for ping is longer than 125 bytes.  Truncating.');
        data = data.slice(0,124);
      }
      frame.binaryPayload = data;
    }
    this.sendFrame(frame);
  }

  // Pong frames have to echo back the contents of the data portion of the
  // ping frame exactly, byte for byte.
  pong(binaryPayload) {
    this._debug('pong');
    var frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    frame.opcode = 0x0A; // WebSocketOpcode.PONG
    if (Buffer.isBuffer(binaryPayload) && binaryPayload.length > 125) {
      this._debug('WebSocket: Data for pong is longer than 125 bytes.  Truncating.');
      binaryPayload = binaryPayload.slice(0,124);
    }
    frame.binaryPayload = binaryPayload;
    frame.fin = true;
    this.sendFrame(frame);
  }

  fragmentAndSend(frame, cb) {
    this._debug('fragmentAndSend');
    if (frame.opcode > 0x07) {
      throw new Error('You cannot fragment control frames.');
    }

    const threshold = this.config.fragmentationThreshold;
    const length = frame.binaryPayload.length;

    // Send immediately if fragmentation is disabled or the message is not
    // larger than the fragmentation threshold.
    if (!this.config.fragmentOutgoingMessages || (frame.binaryPayload && length <= threshold)) {
      frame.fin = true;
      this.sendFrame(frame, cb);
      return;
    }
        
    const numFragments = Math.ceil(length / threshold);
    let sentFragments = 0;
    const sentCallback = function fragmentSentCallback(err) {
      if (err) {
        if (typeof cb === 'function') {
          // pass only the first error
          cb(err);
          cb = null;
        }
        return;
      }
      ++sentFragments;
      if ((sentFragments === numFragments) && (typeof cb === 'function')) {
        cb();
      }
    };
    for (let i=1; i <= numFragments; i++) {
      const currentFrame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
            
      // continuation opcode except for first frame.
      currentFrame.opcode = (i === 1) ? frame.opcode : 0x00;
            
      // fin set on last frame only
      currentFrame.fin = (i === numFragments);
            
      // length is likely to be shorter on the last fragment
      const currentLength = (i === numFragments) ? length - (threshold * (i-1)) : threshold;
      const sliceStart = threshold * (i-1);
            
      // Slice the right portion of the original payload
      currentFrame.binaryPayload = frame.binaryPayload.slice(sliceStart, sliceStart + currentLength);
            
      this.sendFrame(currentFrame, sentCallback);
    }
  }

  sendCloseFrame(reasonCode, description, cb) {
    if (typeof(reasonCode) !== 'number') {
      reasonCode = WebSocketConnection.CLOSE_REASON_NORMAL;
    }
        
    this._debug(`sendCloseFrame state: ${this.state}, reasonCode: ${reasonCode}, description: ${description}`);
        
    if (this.state !== STATE_OPEN && this.state !== STATE_PEER_REQUESTED_CLOSE) { return; }
        
    const frame = new WebSocketFrame(this.maskBytes, this.frameHeader, this.config);
    frame.fin = true;
    frame.opcode = 0x08; // WebSocketOpcode.CONNECTION_CLOSE
    frame.closeStatus = reasonCode;
    if (typeof(description) === 'string') {
      frame.binaryPayload = bufferFromString(description, 'utf8');
    }
        
    this.sendFrame(frame, cb);
    this.socket.end();
  }

  sendFrame(frame, cb) {
    this._debug('sendFrame');
    frame.mask = this.maskOutgoingPackets;
    var flushed = this.socket.write(frame.toBuffer(), cb);
    this.outputBufferFull = !flushed;
    return flushed;
  }
}

// Define static constants and properties
WebSocketConnection.CLOSE_REASON_NORMAL = 1000;
WebSocketConnection.CLOSE_REASON_GOING_AWAY = 1001;
WebSocketConnection.CLOSE_REASON_PROTOCOL_ERROR = 1002;
WebSocketConnection.CLOSE_REASON_UNPROCESSABLE_INPUT = 1003;
WebSocketConnection.CLOSE_REASON_RESERVED = 1004; // Reserved value.  Undefined meaning.
WebSocketConnection.CLOSE_REASON_NOT_PROVIDED = 1005; // Not to be used on the wire
WebSocketConnection.CLOSE_REASON_ABNORMAL = 1006; // Not to be used on the wire
WebSocketConnection.CLOSE_REASON_INVALID_DATA = 1007;
WebSocketConnection.CLOSE_REASON_POLICY_VIOLATION = 1008;
WebSocketConnection.CLOSE_REASON_MESSAGE_TOO_BIG = 1009;
WebSocketConnection.CLOSE_REASON_EXTENSION_REQUIRED = 1010;
WebSocketConnection.CLOSE_REASON_INTERNAL_SERVER_ERROR = 1011;
WebSocketConnection.CLOSE_REASON_TLS_HANDSHAKE_FAILED = 1015; // Not to be used on the wire

WebSocketConnection.CLOSE_DESCRIPTIONS = {
  1000: 'Normal connection closure',
  1001: 'Remote peer is going away',
  1002: 'Protocol error',
  1003: 'Unprocessable input',
  1004: 'Reserved',
  1005: 'Reason not provided',
  1006: 'Abnormal closure, no further detail available',
  1007: 'Invalid data received',
  1008: 'Policy violation',
  1009: 'Message too big',
  1010: 'Extension requested by client is required',
  1011: 'Internal Server Error',
  1015: 'TLS Handshake Failed'
};

module.exports = WebSocketConnection;

function instrumentSocketForDebugging(connection, socket) {
  /* jshint loopfunc: true */
  if (!connection._debug.enabled) { return; }
    
  const originalSocketEmit = socket.emit;
  socket.emit = function(event) {
    connection._debug(`||| Socket Event  '${event}'`);
    originalSocketEmit.apply(this, arguments);
  };
    
  for (const key in socket) {
    if ('function' !== typeof(socket[key])) { continue; }
    if (['emit'].indexOf(key) !== -1) { continue; }
    (function(key) {
      const original = socket[key];
      if (key === 'on') {
        socket[key] = function proxyMethod__EventEmitter__On() {
          connection._debug(`||| Socket method called:  ${key} (${arguments[0]})`);
          return original.apply(this, arguments);
        };
        return;
      }
      socket[key] = function proxyMethod() {
        connection._debug(`||| Socket method called:  ${key}`);
        return original.apply(this, arguments);
      };
    })(key);
  }
}