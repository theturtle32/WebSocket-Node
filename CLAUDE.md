# WebSocket-Node Development Guide

## Build/Test Commands

### Testing
- `pnpm test` - Run all vitest tests (628 unit + integration tests)
- `pnpm test:watch` - Run vitest in watch mode for development
- `pnpm test:ui` - Run vitest with web UI interface
- `pnpm test:coverage` - Run tests with coverage report (target: 85%+)
- `pnpm test:coverage:watch` - Run coverage in watch mode
- `pnpm test:browser` - Run Playwright browser tests (all browsers)
- `pnpm test:browser:chromium` - Run Playwright tests with Chromium only
- `pnpm test:browser:ui` - Run Playwright tests with interactive UI
- `pnpm test:autobahn` - Run Autobahn WebSocket Protocol Compliance Suite (517 tests)
- `pnpx vitest run test/unit/[filename].test.mjs` - Run single vitest test file

### Performance Benchmarking
- `pnpm bench` - Run performance benchmarks for critical operations
- `pnpm bench:baseline` - Save current performance as baseline
- `pnpm bench:check` - Check for performance regressions (CI)

### Linting
- `pnpm lint` - Check code for lint errors
- `pnpm lint:fix` - Auto-fix lint errors (always run before commit)

### Quick Reference
```bash
# Before committing:
pnpm lint:fix && pnpm test && pnpm test:autobahn

# During development:
pnpm test:watch  # Auto-run tests on file changes

# Check coverage:
pnpm test:coverage  # Current: 85.05% ✅
```

## Coding Style

- Use 2 spaces for indentation
- Use pnpm instead of npm
- Constants: ALL_CAPS with underscores
- Variables/Functions: camelCase
- Classes: PascalCase
- Private properties: prefix with underscore (_propertyName)
- Prefer const/let over var for new code
- Use descriptive error messages with proper capitalization
- Minimum Node.js version: 18.x+ (uses ES6+ features including nullish coalescing)
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
- When writing protocol tests, refer to the full text of the protocol specification in docs/rfc6455.txt to guide your implementation.

## Before Committing to Git

- Update any relevant project plan markdown files.
- Ensure that you have created an appropriately named branch for the work in progress.
- Make sure `pnpm lint:fix` is run and not showing any errors.
- When starting work on a new task, create a branch to track that work.
- When completing a task and creating the PR, poll for Gemini's code review. Then address any medium or high priority comments. Then merge the PR, switch locally back to `v2`
 and pull from remote. Then pick up the next task, create a branch, do the work, commit, push, pr, gemini code review, merge, next task, in a loop until all projects are
completed.
- When it would be helpful to reference the latest documentation, use the context7 mcp tools
- If needed, you have the ability to run commands with `sudo` without requiring a password.