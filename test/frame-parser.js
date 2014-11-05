"use strict";

var test = require('tape');
var spigot = require('stream-spigot');
var concat = require('concat-stream');
var through2 = require('through2');
var chunker = require('bytechunker');
var WebSocketFrame = require('websocket').frame;
var WebSocketFrameParser = require('../lib/WebSocketFrameParser');

var maskBytes = new Buffer(4);
var frameHeader = new Buffer(10);
var config = { maxReceivedFrameSize: 0x10000 }; // 64KiB

function textFrame(payload) {
  payload = payload || "Watson, can you hear me?";
  var frame = new WebSocketFrame(maskBytes, frameHeader, config);
  frame.opcode = 0x01; // Text frame
  frame.fin = true;
  frame.binaryPayload = new Buffer(payload, 'utf8');
  return frame;
}


test("frameparser", function(t) {
  t.plan(9);
  
  var payloads = [
    (new Array(27000)).join('Watson, can you hear me? '),
    'Well hello there!'
  ];
  
  var source = spigot.array([
    textFrame(payloads[0]).toBuffer(),
    textFrame(payloads[1]).toBuffer()
  ]);

  var parser = new WebSocketFrameParser();
  var frameCount = 0;

  var prettyPrinter = through2.obj(function(chunk, encoding, done) {
    var frame = chunk;
    frameCount ++;
    t.ok(true, "Got a new WebSocketFrame(" + frameCount + ") from the parser.");
    console.log("Frame length: %d", frame.length);

    var sink = concat(function(data) {
      t.ok(true, "Got the frame's data.");
      t.equal(data.length, payloads[frameCount-1].length, "Payload should be the right length");
      t.equal(data.toString(), payloads[frameCount-1], "Payload should match");
    });

    frame.pipe(sink);

    done();
  });

  source.pipe(chunker(5000)).pipe(parser).pipe(prettyPrinter);
  
  parser.on('end', function() {
    t.equal(frameCount, 2, "There should be two frames emitted.");
  });
});
