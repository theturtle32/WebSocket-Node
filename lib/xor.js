/*
 * Buffer xor module
 * Copyright (c) Agora S.A.
 * Licensed under the MIT License.
 * Version: 1.0
 */

/**
 * Buffer xor module
 * Node version 0.4 and 0.6 compatibility
 */
 
try {
  module.exports = require('../build/Release/xor');
} catch (e) { try {
  module.exports = require('../build/default/xor');
} catch (e) {
  throw e;
}}