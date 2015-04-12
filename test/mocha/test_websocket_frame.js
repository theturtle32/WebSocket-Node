var expect = require('expect.js');
var bufferEqual = require('buffer-equal');
var WebSocketFrame = require('../../lib/WebSocketFrame');


describe('WebSocket frame serialize', function() {
	it('should match a PING Frame', function() {
		var maskBytesBuffer = new Buffer(4),
			frameHeaderBuffer = new Buffer(10),
			frameBytes,
			frame = new WebSocketFrame(maskBytesBuffer, frameHeaderBuffer, {});

		frame.fin = true;
		frame.mask = true;
		frame.opcode = 0x09; // WebSocketFrame.PING

		expect(
			function() {
				frameBytes = frame.toBuffer(true);
			}
		).to.not.throwException();

		expect(
			bufferEqual(frameBytes, new Buffer('898000000000', 'hex'))
		).to.be.ok();
	});
});
