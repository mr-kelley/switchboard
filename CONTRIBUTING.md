# Contributing to Switchboard

Thanks for your interest in contributing! Switchboard is built with an AI-assisted governance system called **Aire**, which shapes how features are planned, implemented, and merged. This guide covers what you need to know whether you're contributing manually or using Claude Code.

## Getting Started

```bash
git clone <repo-url>
cd switchboard
npm install
npm run dev        # start dev server + Electron
npm test           # run test suite
```

### Prerequisites

- Node.js 18+
- npm
- `build-essential` and `python3` (for node-pty native module compilation)

## How Development Works

Switchboard follows **spec-first development**. Every source file under `src/` has a corresponding spec in `specs/` that defines its behavior. The workflow is:

1. **Spec first** — write or update the spec before changing implementation.
2. **Implement** — write the code to match the spec.
3. **Test** — all features require tests. Implementation is not complete without passing tests.
4. **Document** — user-visible changes need documentation updates.

### If you're using Claude Code

Run Claude Code at the repo root. It will automatically pick up `CLAUDE.md` and operate under the Aire governance system:

- It reads the role file, project state, and active sprint.
- It follows spec-first development, decision logging, and git hygiene rules.
- It uses **git promotion Profile B**: work on a feature branch, merge to a `stage/*` branch to verify tests pass, then squash-merge to `main`.
- It maintains `STATE.md`, `specs/INDEX.md`, and decision logs as it works.

You don't need to configure anything — `CLAUDE.md` handles the setup.

### If you're contributing manually

You don't have to follow every Aire governance rule, but please follow these core practices:

1. **Check for a spec** before modifying a file. Specs live at `specs/<same-path-as-src>/<filename>-spec.md`.
2. **Update the spec** if your change alters the file's behavior or public interface.
3. **Write tests** for new functionality. Run `npm test` before submitting.
4. **Keep commits focused** — one logical change per commit.

## Project Structure

```
CLAUDE.md              # Claude Code entry point (Aire config)
STATE.md               # Live project state
NORTHSTAR.md           # Vision and design principles
ROADMAP.md             # Milestones and progress
claude/                # Aire governance specs (role, git hygiene, etc.)
specs/                 # Implementation specs (mirrors src/ structure)
  INDEX.md             # Spec index
sprints/               # Sprint definitions
decisions/             # Decision log
docs/                  # User-facing docs (bug log, guides)
src/
  main/                # Electron main process
  renderer/            # React frontend
  shared/              # Shared types
build/                 # Packaging assets (icon, post-install scripts)
```

## Adding a Feature

### Small changes (bug fixes, minor tweaks)

1. Create a branch: `git checkout -b fix/description`
2. Make your changes.
3. Run tests: `npm test`
4. Commit with a descriptive message.
5. Open a PR against `main`.

### Larger features

1. Check `ROADMAP.md` to see if the feature fits an existing milestone.
2. Write or update the relevant spec(s) in `specs/`.
3. Create a branch: `git checkout -b feat/description`
4. Implement and test.
5. Update `specs/INDEX.md` if you added new specs.
6. Open a PR against `main`.

If you're unsure whether a feature fits the project direction, open an issue first to discuss.

## Filing Bugs

Open a GitHub issue with:

- **What happened** — describe the behavior you saw.
- **What you expected** — describe what should have happened.
- **Steps to reproduce** — minimal steps to trigger the bug.
- **Environment** — OS, Node version, how you installed (deb/AppImage/snap/dev).

See `docs/bugs.md` for examples of how bugs are documented in this project.

## Code Conventions

- **Language**: TypeScript in strict mode.
- **Renderer bundler**: Vite. **Main process**: tsc.
- **Tests**: Vitest for unit tests. Playwright for E2E (when added).
- **Formatting**: follow existing code style. No lint/format tooling is enforced yet.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All main/renderer communication goes through validated IPC. Never bypass these.

## Commit Messages

Follow conventional commit format:

```
type(scope): short description

Optional longer explanation.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
Scopes: `terminal`, `sidebar`, `idle`, `persist`, `packaging`, `state`, etc.

Examples:
```
feat(terminal): add WebGL context loss recovery
fix(idle): reset activity timer on user input
docs(state): mark Sprint 06 complete
```

## Decision Logging

Architectural decisions are logged in `decisions/`. If your change involves a non-obvious technical choice (choosing one approach over another, trade-offs, rejecting alternatives), consider adding a decision log entry. See `claude/decision-log-spec.md` for the format.

## Testing

```bash
npm test              # run all tests once
npm run test:watch    # watch mode
```

All tests must pass before merging to `main`. Currently at 99 tests across 14 test files.

### What to test

- **Unit tests** for logic in main process modules (session manager, idle detector, etc.).
- **Component tests** for React components (using @testing-library/react with jsdom).
- **Integration tests** for IPC handler wiring.

xterm.js requires a real DOM and canvas, so deep terminal rendering tests are deferred to E2E.

## Building Packages

```bash
npm run dist            # all formats
npm run dist:deb        # Debian package
npm run dist:appimage   # AppImage
npm run dist:snap       # Snap (classic confinement)
```

See the [README](README.md#building--packaging) for installation instructions and package details.

## Questions?

Open an issue or check the existing specs and docs. The `specs/` directory is the most detailed source of truth for how things work and why.
