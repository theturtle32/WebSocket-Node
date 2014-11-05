/************************************************************************
 *  Copyright 2014 Brian McKelvey
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

var stream = require('readable-stream');
var BufferList = require('bl');
var util = require('util');
var utils = require('./utils');
var debug = utils.debuglog('websocket_parser');
var WebSocketFrame = require('./WebSocketFrame');
var Transform = stream.Transform;

util.inherits(WebSocketFrameParser, Transform);
module.exports = WebSocketFrameParser;

var RECEIVE_HEADER = 1;
var RECEIVE_16_BIT_LENGTH = 2;
var RECEIVE_64_BIT_LENGTH = 3;
var RECEIVE_MASK_KEY = 4;
var BEGIN_STREAM = 5;
var STREAMING_PAYLOAD = 6;

function WebSocketFrameParser(options) {
  if (!(this instanceof WebSocketFrameParser)) {
    return new WebSocketFrameParser(options);
  }
  
  Transform.call(this);
  this._writableState.objectMode = false;
  this._readableState.objectMode = true;
  
  this._resetParserState();
  
  this._frameDrainHandler = this._frameDrained.bind(this);
};

WebSocketFrameParser.prototype._resetParserState = function() {
  debug("_resetParserState");
  this._state = RECEIVE_HEADER;
  this._bytesRemaining = 0;
  this._bl = new BufferList();
  var frame = this._currentFrame = new WebSocketFrame();
  var originalEmit = frame.emit;
  frame.emit = function(event) {
    if (event === 'data') {
      console.log("emit([\"data\"]) len: " + arguments[1].length);
    }
    else {
      console.log("emit(%j)", Array.prototype.slice.call(arguments));
    }
    originalEmit.apply(frame, arguments);
  }
};

WebSocketFrameParser.prototype._frameDrained = function() {
  
};

WebSocketFrameParser.prototype._write = function(chunk, encoding, done) {
  if (this._state === STREAMING_PAYLOAD) {
    debug("_write - streaming to frame.");
    
    this._streamPayload(chunk, done);
    return;
  }
  
  debug("_write - normal transform implementation.  Chunk size: %d bytes", chunk.length);
  return Transform.prototype._write.call(this, chunk, encoding, done);
};

WebSocketFrameParser.prototype._transform = function _transform(chunk, encoding, done) {
  var error;
  this._bl.append(chunk);
  
  if (this._state === RECEIVE_HEADER) {
    if (!this._parseHeader(done)) { return; }
  }

  switch (this._state) {
    case RECEIVE_16_BIT_LENGTH:
      if (this._bl.length >= 2) {
        this._currentFrame.length = this._bl.readUInt16BE(0);
        this._bl.consume(2);
        this._state = RECEIVE_MASK_KEY;
      }
      break;
    case RECEIVE_64_BIT_LENGTH:
      if (this._bl.length >= 8) {
        if (this._bl.readInt32BE(0)) {
          done(new Error("Unsupported 64-bit length frame received"));
          return;
        }
        this._currentFrame.length = this._bl.readUInt32BE(4);
        this._bl.consume(8);
        this._state = RECEIVE_MASK_KEY;
      }
      break;
  }
  
  if (this._state === RECEIVE_MASK_KEY) {
    this._parseMaskKey();
  }
  
  if (this._state === BEGIN_STREAM) {
    this._bytesRemaining = this._currentFrame.length;
    this.push(this._currentFrame);
    this._streamBufferlist();
    
    done();
    return;
  }
  
  done();
};

WebSocketFrameParser.prototype._parseHeader = function(done) {
  var frame = this._currentFrame;
  if (this._bl.length < 2) { return; }
  var header = this._bl.readUInt16BE(0);
  this._bl.consume(2);
  debug('_parseHeader - %d %d', (header & 0xFF00) >> 8, header & 0xFF);
  
  frame.fin     = Boolean(header & 0x8000);
  frame.rsv1    = Boolean(header & 0x4000);
  frame.rsv2    = Boolean(header & 0x2000);
  frame.rsv3    = Boolean(header & 0x1000);
  frame.mask    = Boolean(header & 0x0080);

  frame.opcode  = (header & 0x0F00) >> 8;
  frame.length  =  header & 0x7F;
  
  // Control frame sanity check
  if (frame.opcode >= 0x08) {
      if (frame.length > 125) {
          done(new Error("Illegal control frame longer than 125 bytes."));
          return false;
      }
      if (!frame.fin) {
          done(new Error("Control frames must not be fragmented."));
          return false;
      }
  }

  if (frame.length === 126) {
      this._state = RECEIVE_16_BIT_LENGTH;
  }
  else if (frame.length === 127) {
      this._state = RECEIVE_64_BIT_LENGTH;
  }
  else {
      this._state = RECEIVE_MASK_KEY;
  }
  
  return true;
};

WebSocketFrameParser.prototype._parseMaskKey = function() {
  debug("_parseMaskKey");
  var frame = this._currentFrame;
  var bufferList = this._bl;
  if (frame.mask) {
    if (bufferList.length >= 4) {
      frame.maskBytes = bufferList.slice(0, 4);
      bufferList.consume(4);
      this._state = BEGIN_STREAM;
    }
  }
  else {
    this._state = BEGIN_STREAM;
  }
};

WebSocketFrameParser.prototype._streamBufferlist = function() {
  if (this._bl.length === 0) { return; }
  debug('_streamBufferlist');
  var frame = this._currentFrame;
  var chunk = this._bl.slice(0, frame.length);
  this._bytesRemaining -= chunk.length;
  debug("_streamBufferlist - pushing %d bytes.  %d bytes remaining.",
        chunk.length, this._bytesRemaining);
  this._bl.consume(chunk.length);
  this._currentFrame.push(chunk);
  this._state = STREAMING_PAYLOAD;
  this._checkPayloadEnd();
};

WebSocketFrameParser.prototype._streamPayload = function(chunk, done) {
  debug('_streamPayload');
  if (chunk.length > this._bytesRemaining) {
    this.unshift(chunk.slice(this._bytesRemaining, chunk.length));
    chunk = chunk.slice(0, this._bytesRemaining);
  }
  this._bytesRemaining -= chunk.length;
  var shouldPause = !this._currentFrame.push(chunk);
  debug("_streamPayload - pushed %d bytes. shouldPause: %s  Bytes Remaining: %d",
    chunk.length, shouldPause, this._bytesRemaining);
  this._checkPayloadEnd();
  done();
};

WebSocketFrameParser.prototype._checkPayloadEnd = function() {
  debug("_checkPayloadEnd");
  if (this._bytesRemaining === 0) {
    debug("  ending frame content stream");
    this._currentFrame.push(null);
    this._resetParserState();
  }
  else if (this._bytesRemaining < 0) {
    throw new Error(
      util.format(
        "Critical internal error: bytesRemaining = %d  Expected %d",
        this._bytesRemaining, 0)
    );
  }
};
