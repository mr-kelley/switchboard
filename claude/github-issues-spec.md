---
title: GitHub Issues Governance (Collaborative Workflows)
version: 0.1.0
maintained_by: Aire System Architect (ASA)
domain_tags: [system, governance, github, collaboration]
status: draft
platform: claude-code
license: Apache-2.0
---

# Purpose
Define how GitHub Issues integrate with Aire project governance when a project transitions from solo development to collaborative workflows. This spec bridges the GitHub Issues system (an external, non-repo artifact) to the existing planning, decision-logging, and git hygiene governance.

This spec is **optional**. It is introduced to a project only when collaborative workflows on GitHub are required. Solo projects that do not use GitHub Issues do not need this spec.

# Scope

## Covers
- How Issues relate to sprints, milestones, and planning artifacts.
- Traceability between Issues, commits, PRs, and decision log entries.
- Role permissions: what roles may and may not do with Issues via `gh`.
- Issue lifecycle from creation through closure.
- Self-assignment and coordination conventions for collaborators.

## Does Not Cover
- Sprint structure, acceptance criteria, or milestone definitions (governed by `claude/planning-spec.md`).
- Commit message format or branch naming (governed by `claude/claude.git-hygiene.md`).
- Decision logging format or classification (governed by `claude/decision-log-spec.md`).
- GitHub Projects boards, Discussions, Wikis, or other GitHub features beyond Issues.
- Repository permissions, team membership, or access control configuration.

# Definitions

- **Collaborator**: a human plus their associated AI agent role(s), working together as a unit. The human handles GitHub interactions that require judgment (triage, review, discussion). The agent handles implementation under role governance.
- **Project owner**: the human who owns the repository and has final authority over triage, prioritization, and merge decisions.
- **Issue**: a GitHub Issue — a numbered, titled thread that describes a unit of work (bug, feature request, question, or task). Issues live in GitHub's database, not in the git repository.

# Issue Lifecycle

## Creation
Anyone with appropriate GitHub permissions may create an Issue. Issues SHOULD use the project's Issue templates (if configured) to provide structured information.

An Issue is not a directive to a role. It is a request for work that must be triaged and translated into the project's planning system before a role acts on it.

## Triage
The project owner triages Issues. Triage means:
1. Validating the Issue (is it actionable? is it in scope?).
2. Labeling it (bug, enhancement, question, etc.).
3. Assigning it to a milestone (if applicable).
4. Marking it as ready for work or requesting more information.

Roles MUST NOT self-triage. A role may read an Issue for context, but it MUST NOT begin work on an Issue that the project owner has not explicitly approved for work — either by assigning it to a milestone, labeling it as ready, or directly instructing the role to work on it.

Reinforcement: roles do not decide what Issues become work. The project owner decides.

## Assignment
Collaborators self-assign Issues they intend to work on. Self-assignment signals to other collaborators that the work is claimed. A collaborator SHOULD NOT begin work on an Issue without assigning it first.

If a collaborator cannot complete an assigned Issue, they SHOULD unassign themselves and leave a comment explaining the status so another collaborator can pick it up.

## Translation to Planning Artifacts
Once an Issue is assigned and ready for work, the collaborator translates it into the project's planning system:
- Create or update a sprint file that includes the Issue work as a deliverable.
- Reference the Issue number in the sprint file (e.g., "Implements #14" or "Fixes #7").
- The sprint file, not the Issue, governs the role's execution. The Issue provides context; the sprint and its governing specs provide the contract.

This translation step is critical. It brings the Issue's intent into the repo where the role can consume it without depending on GitHub access.

Reinforcement: the sprint file governs execution, not the Issue.

## Work
Work proceeds under normal role governance — spec-first, one deliverable at a time, tested promotion. The only addition is traceability back to the Issue (see Traceability below).

## Closure
Issues are closed by one of:
- **PR merge with a closing keyword**: a PR description containing `Resolves #14`, `Fixes #14`, or `Closes #14` automatically closes the Issue when the PR merges to the default branch. This is the preferred method.
- **Manual closure**: the project owner or assignee closes the Issue with a comment explaining the resolution.
- **Closure without work**: the project owner closes the Issue as `not planned` if it is out of scope, a duplicate, or otherwise not actionable.

Roles MAY close Issues via `gh issue close` only when the associated work is complete, tests pass, and the PR has been merged. Premature closure — before work is verified — is not permitted.

Reinforcement: Issues close when work is verified complete, not before.

# Traceability

Traceability connects Issues to the project's audit trail. The goal is bidirectional: given an Issue, you can find the commits, PR, and decision log entries; given a commit, you can find the Issue it addresses.

## Issue → Commits and PRs
- PR descriptions MUST reference the Issue using a closing keyword: `Resolves #14`, `Fixes #14`, or `Closes #14`.
- Commit messages SHOULD reference the Issue number in the body when the commit directly addresses Issue work:
  ```
  feat(auth): implement token refresh flow

  Resolves #14
  Implements DEC-000045
  ```

## Issue → Decision Log
- If work on an Issue produces Class B or C decisions, the decision log entry SHOULD include the Issue number in the `links` field or summary.

## Issue → Sprint
- The sprint file that contains the Issue's work MUST reference the Issue number in its deliverables or goal section.

Reinforcement: PRs must reference the Issue with a closing keyword. Commits and decision log entries should reference the Issue number.

# Role Permissions

Roles may use the `gh` CLI to interact with Issues, subject to these constraints:

## Permitted (no approval required)
- `gh issue view` — read an Issue for context.
- `gh issue list` — browse open Issues.

## Permitted (with constraints)
- `gh issue close` — only after associated work is complete, tests pass, and PR is merged.
- `gh issue comment` — only to report work status (completion, blockers, questions for the project owner). Comments must be substantive, not noisy.

## Not Permitted
- `gh issue create` — roles do not create Issues. Issue creation is a human activity. If a role discovers a bug or identifies needed work during implementation, it flags it to the human via normal escalation (HALT + FLAG_ISSUE), and the human decides whether to create an Issue.
- `gh issue edit` — roles do not modify Issue titles, descriptions, labels, or milestones. Triage and metadata are human-owned.
- `gh issue reopen` — roles do not reopen closed Issues. If a closed Issue needs to be revisited, the human decides.
- `gh issue transfer`, `gh issue pin`, `gh issue lock` — administrative actions are human-only.

Reinforcement: roles read and close Issues; humans create, edit, and triage them.

# Labels

Projects using this spec SHOULD define at minimum the following labels:

| Label | Purpose |
|---|---|
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `question` | Clarification needed |
| `good first issue` | Suitable for new collaborators |
| `blocked` | Waiting on external input or dependency |
| `wontfix` | Acknowledged but will not be addressed |

Additional labels are project-specific. Keep the label set small and meaningful — labels that aren't used for filtering or triage are clutter.

# Issue Templates

Projects using this spec SHOULD configure GitHub Issue templates to ensure consistent, structured information from contributors. Templates live in `.github/ISSUE_TEMPLATE/` and are committed to the repository.

Recommended templates:
- **Bug report**: steps to reproduce, expected behavior, actual behavior, environment.
- **Feature request**: problem statement, proposed solution, alternatives considered.

Templates are not governed by this spec beyond the recommendation to use them. Their content is project-specific.

# Edge Cases / Fault Handling

**Issue references an area outside the role's scope:**
The role MUST NOT work on it. Flag to the human that the Issue requires a different role or manual intervention.

**Issue is assigned but the governing spec doesn't exist:**
Normal spec-first rules apply. The role creates or proposes a spec before implementation. The Issue does not override spec-first governance.

**Issue is stale (assigned but no activity):**
The project owner periodically reviews assigned Issues. If a collaborator has gone silent, the owner may unassign the Issue and return it to the backlog. This is a human decision, not a role action.

**Multiple Issues overlap in scope:**
The project owner triages the overlap — consolidate into one Issue, split into distinct Issues, or mark duplicates. Roles do not resolve Issue overlap.

**`gh` CLI is not available or not configured:**
The role falls back to normal operation: the human provides Issue context directly (paste the Issue body, summarize the requirements, or include the Issue number for reference). The role does not require `gh` access to function — it is a convenience, not a dependency.

# Test Strategy
Tests: N/A — this is a governance spec defining process conventions, not software behavior. Compliance is verified through audit (traceability checks, permission adherence) rather than automated tests.

# Completion Criteria
This spec is correctly adopted when:
1. The project's roles reference this spec in their Inputs section.
2. PRs for Issue-driven work include closing keywords referencing the Issue number.
3. Sprint files reference Issue numbers for Issue-driven deliverables.
4. Roles do not create, edit, or triage Issues.
5. Collaborators self-assign before beginning work.

# Change Control
Regenerate-not-patch. Update version and provenance on every change.
