# WebSocket-Node Development Guide

## Build/Test Commands

- Run all tests: `npm test`
- Run single test: `npx tape test/unit/[filename].js`
- Lint codebase: `npm run lint`
- Fix lint issues: `npm run lint:fix`
- Run autobahn tests (full integration test suite): `npm run test:autobahn`

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

## Workflow

- Before committing to git, make sure to check for lint errors with `npm run lint:fix` and verify that all the tests pass.
- Before beginning on work in the ES6_REFACTORING_PLAN.md file, update it to reflect what will be in progress.
- After completing work in the ES6_REFACTORING_PLAN.md file, update it to reflect what was completed.
