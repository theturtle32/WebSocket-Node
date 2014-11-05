var Transform = require('readable-stream/transform');
var util = require('util');

util.inherits(FixedLengthStream, Transform);

function FixedLengthStream(length) {
  if ('number' !== typeof length) { throw new Error("invalid length") };
  this._fixedLength = length;
  this._bytesCounted = 0;
}

FixedLengthStream.prototype._transform = function(chunk, encoding, done) {
  var extra;
  
  if (this._bytesCounted + chunk.length > this._fixedLength) {
    var neededLength = this._fixedLength - this._bytesCounted;
    extra = chunk.slice(neededLength, chunk.length);
    chunk = chunk.slice(0, neededLength);
    this.bytesCounted += chunk.length;
    this.push(chunk);
    this.unshift(extra);
    this.push(null);
    return done();
  }
  
  this._bytesCounted += chunk.length;
  
  if (this._bytesCounted === this._fixedLength) {
    this._bytesCounted
    this.push(chunk);
    this.push(null);
    return done();
  }

  this.push(chunk);
  return done();
};

module.exports = FixedLengthStream;
