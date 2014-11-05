var Transform = require('readable-stream/transform');
var util = require('util');

util.inherits(XORMaskingStream, Transform);

function XORMaskingStream(maskBytes, initPosition) {
  this._maskBytes = maskBytes || new Buffer(4);
  this._pos = initPosition || 0;
  this._counter = 0;
  Transform.call(this);
}

XORMaskingStream.prototype._transform = function(chunk, encoding, done) {
  for (var i=0, len=chunk.length; i < len; i ++) {
    chunk[i] = chunk[i] ^ this._maskBytes[this._pos];
    this._pos = (this._pos + 1) & 0x03;
  }
  this.push(chunk);
  done();
}

module.exports = XORMaskingStream;
