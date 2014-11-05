/************************************************************************
 *  Copyright 2010-2014 Brian McKelvey
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
var util = require('util');
var PassThrough = require('stream').PassThrough;

util.inherits(WebSocketFrame, PassThrough);

function WebSocketFrame() {
  this.fin = this.rsv1 = this.rsv2 = this.rsv3 = this.mask = false;
  this.length = 0;
  this.opcode = 0;
  this.maskBytes = null;
  
  PassThrough.call(this);
}

WebSocketFrame.prototype.toString = function() {
    return "Opcode: " + this.opcode + ", fin: " + this.fin + ", length: " + this.length + ", masked: " + this.mask;
};

module.exports = WebSocketFrame;
