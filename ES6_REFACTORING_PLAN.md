# WebSocket-Node ES6 Refactoring Plan

## Current Status

The ES6 refactoring is **partially complete**. The following core library files have been refactored:

### ✅ Completed Files (13 files)
- `lib/Deprecation.js` - Basic var → const conversion
- `lib/W3CWebSocket.js` - var → const/let conversion
- `lib/WebSocketClient.js` - var → const conversion
- `lib/WebSocketConnection.js` - Extensive refactoring (1442 lines changed)
- `lib/WebSocketFrame.js` - var → const conversion
- `lib/WebSocketRequest.js` - var → const conversion
- `lib/WebSocketRouter.js` - var → const conversion
- `lib/WebSocketRouterRequest.js` - Basic var → const conversion
- `lib/WebSocketServer.js` - var → const conversion
- `lib/browser.js` - var → const conversion
- `lib/utils.js` - var → const/let conversion + template literals
- `lib/websocket.js` - var → const conversion
- `example/whiteboard/whiteboard.js` - Example file refactored

### 🔄 Refactoring Patterns Applied
1. **Variable Declarations**: `var` → `const`/`let` based on reassignment
2. **Template Literals**: String concatenation → template literals (partial)
3. **Block Scoping**: Proper const/let scoping in loops and functions
4. **Modern Syntax**: Arrow functions in some contexts

## Remaining Work

### 1. **Unmodified Library Files** (1 file)
- `lib/version.js` - Already uses modern `module.exports`, no changes needed

### 2. **Test Suite Refactoring** (15 files)
**Priority: Medium** - Tests use old ES3/ES5 patterns

#### Unit Tests
- `test/unit/request.js` - Uses `var`, old-style functions
- `test/unit/dropBeforeAccept.js` - Needs var → const/let conversion
- `test/unit/regressions.js` - Old variable declarations
- `test/unit/w3cwebsocket.js` - var → const refactoring needed
- `test/unit/websocketFrame.js` - Old-style variable declarations

#### Test Infrastructure
- `test/shared/test-server.js` - Core test server utilities
- `test/shared/start-echo-server.js` - Echo server for tests

#### Test Scripts
- `test/scripts/memoryleak-server.js` - Memory leak testing
- `test/scripts/memoryleak-client.js` - Memory leak client
- `test/scripts/libwebsockets-test-server.js` - LibWebSockets compatibility
- `test/scripts/libwebsockets-test-client.js` - LibWebSockets client
- `test/scripts/fragmentation-test-client.js` - Fragmentation testing
- `test/scripts/fragmentation-test-server.js` - Fragmentation server
- `test/scripts/echo-server.js` - Basic echo server
- `test/scripts/autobahn-test-client.js` - Autobahn test suite client

### 3. **Example Files** (1 file)
**Priority: Low** - Examples should demonstrate modern patterns
- `example/whiteboard/public/client.js` - Browser-side client code

### 4. **Code Quality Improvements**
**Priority: High** - Enhance already-refactored files

#### A. **Enhanced Modern JavaScript Features**
- **Arrow Functions**: Convert appropriate function expressions
- **Destructuring**: Extract object/array properties modernly
- **Template Literals**: Complete string concatenation replacement
- **Default Parameters**: Replace manual parameter defaulting
- **Enhanced Object Literals**: Use shorthand property syntax
- **Spread Operator**: Replace `Array.prototype.slice.call()` patterns

#### B. **Async/Await Migration** (Optional)
- Consider Promise-based APIs where appropriate
- Maintain backward compatibility with callback patterns

#### C. **Class Syntax** (Evaluation Needed)
- Evaluate prototype-based constructors for class conversion
- Maintain inheritance patterns with extends/super
- Consider impact on Node.js 4.x+ compatibility requirements

### 5. **Configuration & Build Updates**
**Priority: Medium**
- Update ESLint rules for ES6+ patterns
- Verify Node.js 4.x+ compatibility maintained
- Update package.json engines field if needed

### 6. **Documentation Updates**
**Priority: Low**
- Update code examples in README to use modern syntax
- Ensure API documentation reflects any syntax changes

## Implementation Strategy

### Phase 1: Test Suite Modernization
**Goal**: Ensure test reliability during refactoring
1. Refactor unit tests (`test/unit/*.js`)
2. Refactor test infrastructure (`test/shared/*.js`)
3. Refactor test scripts (`test/scripts/*.js`)
4. Run full test suite to ensure no regressions

### Phase 2: Code Quality Enhancements
**Goal**: Maximize modern JavaScript usage in core library
1. **Enhanced Template Literals** - Complete string concatenation replacement
2. **Arrow Functions** - Convert appropriate callbacks and handlers
3. **Destructuring** - Simplify object property extraction
4. **Default Parameters** - Clean up manual parameter handling
5. **Object Literal Enhancements** - Use shorthand syntax

### Phase 3: Advanced Features (Optional)
**Goal**: Evaluate modern patterns without breaking changes
1. **Class Syntax Evaluation** - Assess constructor → class conversion
2. **Async/Await Integration** - Add Promise-based alternatives
3. **Module System** - Consider ES6 imports (Node.js version dependent)

### Phase 4: Validation & Cleanup
**Goal**: Ensure quality and compatibility
1. Run complete test suite (`npm test`)
2. Run autobahn compatibility tests
3. Lint entire codebase (`npm run gulp`)
4. Update documentation and examples
5. Performance regression testing

## Compatibility Considerations

- **Node.js 4.x+ Support**: Maintain current compatibility requirements
- **ES6 Feature Support**: All used features must work in Node.js 4.x+
- **API Compatibility**: No breaking changes to public APIs
- **Performance**: Ensure refactoring doesn't impact WebSocket performance

## Risk Assessment

**Low Risk**: Variable declaration changes (var → const/let)
**Medium Risk**: Function expression → arrow function conversion
**High Risk**: Constructor → class conversion, async/await integration

## Success Criteria

1. ✅ All tests pass (`npm test`)
2. ✅ Autobahn tests pass (`cd test/autobahn && ./run-wstest.sh`)
3. ✅ Linting passes (`npm run gulp`)
4. ✅ No performance regressions
5. ✅ Backward compatibility maintained
6. ✅ Modern JavaScript patterns consistently applied