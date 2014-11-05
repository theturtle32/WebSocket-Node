"use strict";

var buffertools = require('buffertools');
var test = require('tape');
var spigot = require('stream-spigot');
var concat = require('concat-stream');
var chunker = require('bytechunker');
var spy = require('through2-spy');
var XORMaskingStream = require('../lib/stream_modules/xor-masking-stream');

function generateRandomMask() {
  var result = new Buffer(4);
  for (var i=0; i < 4; i++) {
    result[i] = (Math.random() * 0xFF) | 0;
  }
  return result;
}

function buildSource(text, chunkSize) {
  var source = spigot.array([text]);
  if ('number' === typeof chunkSize) {
    return ;
  }
  return source;
}

function generateRandomBinaryData(length) {
  length = length || 16384;
  var buf = new Buffer(length);
  for (var i=0; i < length; i ++) {
    buf[0] = Math.floor(Math.random() * 0xFF);
  }
  return buf;
}

function setup(mode) {
  mode = mode || "string";
  var mask = generateRandomMask();
  var state = {
    sourceChunkCount: 0,
    sourceByteCount: 0,
    outputChunkCount: 0,
    outputByteCount: 0,
    mask: mask,
    masker: new XORMaskingStream(mask),
    unmasker: new XORMaskingStream(mask),
    sourceCounter: spy(function(chunk) {
      state.sourceChunkCount ++;
      state.sourceByteCount += chunk.length;
    }),
    outputCounter: spy(function(chunk) {
      state.outputChunkCount ++;
      state.outputByteCount += chunk.length;
    })
  };
  if (mode === 'string') {
    state.text = (new Array(20)).join("This Is A Test Of The Emergency Brodcasting System. ");
    state.source = spigot.array([state.text]);
  }
  else if (mode === 'binary') {
    state.binary = generateRandomBinaryData();
    state.source = spigot.array([state.binary]);
  }
  return state;
}


test("XOR-Masking-Stream: Masked output, String Source", function(t) {
  var state = setup('string');
  t.plan(2);
  
  var sink = concat(function(result) {
    var resultString = result.toString();
    t.notEqual(resultString, state.text, "masked output should not match input.");
    t.equal(state.sourceByteCount, state.outputByteCount,
      "masked output should be the same number of bytes as the encoded input string");
  });
  
  state.source
    .pipe(state.sourceCounter)
    .pipe(state.masker)
    .pipe(state.outputCounter)
    .pipe(sink);
});

test("XOR-Masking-Stream: Masked output, Binary Source", function(t) {
  var state = setup('binary');
  t.plan(4);
  var sink = concat(function(result) {
    t.equal(state.outputByteCount, state.sourceByteCount,
      "Stream output byte count should match source byte count");
    t.equal(result.length, state.binary.length,
      "Final accumulated buffer should be the same length as the source buffer.");
    t.equal(result.length, state.sourceByteCount,
      "Final accumulated buffer should be the same lenth as the observed source stream byte count.");
    t.equal(state.binary.length, state.outputByteCount,
      "Original buffer should be the same length as the observed output byte count.");
  });
  
  state.source
    .pipe(state.sourceCounter)
    .pipe(state.masker)
    .pipe(state.outputCounter)
    .pipe(sink);
});

test("XOR-Masking-Stream: Masking -> Unmasking Round-Trip.  Non-Chunking String Source", function(t) {
  var state = setup('string');
  t.plan(3);
  
  var sink = concat(function(result) {
    t.equal(result.toString(), state.text, "input and output strings should match");
    t.equal(state.sourceChunkCount, state.outputChunkCount, "size and number of chunks should match");
    t.equal(state.sourceChunkCount, 1, "there should only be one chunk");
  });
  
  state.source
    .pipe(state.sourceCounter)
    .pipe(state.masker)
    .pipe(state.unmasker)
    .pipe(state.outputCounter)
    .pipe(sink);
});

test("XOR-Masking-Stream: Masking -> Unmasking Round-Trip.  Non-Chunking Binary Source", function(t) {
  var state = setup('binary');
  t.plan(3);
  
  var sink = concat(function(result) {
    t.assert(buffertools.equals(result, state.binary), "input and output buffers should match");
    t.equal(state.sourceChunkCount, state.outputChunkCount, "size and number of chunks should match");
    t.equal(state.sourceChunkCount, 1, "there should only be one chunk");
  });
  
  state.source
    .pipe(state.sourceCounter)
    .pipe(state.masker)
    .pipe(state.unmasker)
    .pipe(state.outputCounter)
    .pipe(sink);
});

test("XOR-Masking-Stream: Masking -> Unmasking Round-Trip.  Chunking String Source", function(t) {
  var state = setup('string');
  t.plan(3);

  var sink = concat(function(result) {
    t.equal(result.toString(), state.text, "input and output strings should match");
    t.equal(state.sourceChunkCount, state.outputChunkCount, "size and number of chunks should match");
    t.assert(state.sourceChunkCount > 1, "there should be more than one chunk");
  });

  state.source
    .pipe(chunker(3))
    .pipe(state.sourceCounter)
    .pipe(state.masker)
    .pipe(state.unmasker)
    .pipe(state.outputCounter)
    .pipe(sink);
});

test("XOR-Masking-Stream: Masking -> Unmasking Round-Trip.  Chunking Binary Source", function(t) {
  var state = setup('binary');
  t.plan(3);

  var sink = concat(function(result) {
    t.assert(buffertools.equals(result, state.binary), "input and output strings should match");
    t.equal(state.sourceChunkCount, state.outputChunkCount, "size and number of chunks should match");
    t.assert(state.sourceChunkCount > 1, "there should be more than one chunk");
  });

  state.source
    .pipe(chunker(3))
    .pipe(state.sourceCounter)
    .pipe(state.masker)
    .pipe(state.unmasker)
    .pipe(state.outputCounter)
    .pipe(sink);
});
