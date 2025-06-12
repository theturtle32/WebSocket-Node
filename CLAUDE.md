# WebSocket-Node Development Guide

## Build/Test Commands
- Run all tests: `npm test`
- Run single test: `npx tape test/unit/[filename].js`
- Lint codebase: `npm run gulp` or `npx gulp lint`
- Run autobahn tests: `cd test/autobahn && ./run-wstest.sh`

## Coding Style
- Use 2 spaces for indentation
- Constants: ALL_CAPS with underscores
- Variables/Functions: camelCase
- Classes: PascalCase
- Private properties: prefix with underscore (_propertyName)
- Prefer const/let over var for new code
- Use descriptive error messages with proper capitalization
- Maintain backward compatibility with Node.js 4.x+
- Use EventEmitter pattern for async events
- Always catch and handle errors in Promise chains
- Document API facing methods with clear JSDoc comments
- Use utility functions from ./lib/utils.js for buffer operations
- Add debug logging with the debug module at key points