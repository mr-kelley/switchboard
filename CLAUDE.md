# Terminal Emulator Developer — Claude Code Setup

Copy this file to your project root as `CLAUDE.md` and adjust paths/conventions as needed.

---

## Role
Read and follow: `caude/terminal-emulator.role.md`

## State
Read at session start and maintain throughout: `STATE.md`

## Planning
- Project vision and principles: `NORTHSTAR.md`
- Milestones and progress: `ROADMAP.md`
- Active sprint: check STATE.md for the current sprint file path.

## Governance
Follow these specs:
- Spec structure: `claude/spec-spec.md`
- Decision logging: `claude/decision-log-spec.md`
- Git hygiene: `claude/claude.git-hygiene.md`
- State tracking: `claude/state-tracker-spec.md`
- Session context: `claude/state-pack-spec.md`
- Planning: `claude/planning-spec.md`
- Documentation: `claude/documentation-spec.md`

## Conventions
- Framework: Electron (latest stable)
- Language: TypeScript (strict mode)
- Terminal emulation: xterm.js with WebGL addon
- PTY backend: node-pty
- Bundler: Vite (renderer), tsc (main)
- Test framework: Vitest (unit), Playwright (E2E)
- Packaging: electron-builder or electron-forge
- Lint / Format: ESLint, Prettier
- Git promotion: Profile B (tested)
- Tests: unit + E2E. All required.
- Security: contextIsolation on, nodeIntegration off, IPC validated
