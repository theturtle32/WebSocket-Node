# WebSocket-Node Development Guide

## Build/Test Commands

- Run all tests: `pnpm test`
- Run single test: `pnpx tape test/unit/[filename].js`
- Lint codebase: `pnpm lint`
- Fix lint issues: `pnpm lint:fix`
- Run autobahn tests (full integration test suite): `pnpm test:autobahn`

## Coding Style

- Use 2 spaces for indentation
- Use pnpm instead of npm
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

- Before committing to git, make sure to check for lint errors with `pnpm lint:fix` and verify that all the tests pass, including the autobahn tests.
- Before beginning work on a section of a project plan, update the project plan file to reflect what will be in progress.
- After completing work on a section of a project plan, update it to reflect what was completed before committing your changes to git.
- All the work we are doing right now is in service of preparing a version 2.0 release. All of our work should feed back into the `v2` branch.
- Always create a new branch for each project execution phase, push the work to github, and open a pull request into `v2` so I can review it before merging.

## Before Committing to Git

- Update any relevant project plan markdown files.
- Make sure `pnpm lint:fix` is run and not showing any errors.
