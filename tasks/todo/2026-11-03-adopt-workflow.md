# Adopt the 6-step workflow

**Asked for:** "follow this" (the 6-step Claude Code framework screenshot, 3 Nov 2026)
**Done means:** the workflow is in `CLAUDE.md`, past lessons are in `tasks/lessons.md`, and `tasks/todo.md` is a plan template.

## Before starting

- [x] Reviewed project memory for the owner's past corrections (no `tasks/lessons.md` existed yet)
- [x] Read `CLAUDE.md`, `AGENTS.md` and `scripts/claudeGuides.test.ts` (root guide stays under 32 KB)

## Plan

- [x] 1. Add a concise *How to work* section to `CLAUDE.md`, reconciled with the auto-merge and "prefer action" rules
- [x] 2. Seed `tasks/lessons.md` from project memory
- [x] 3. Write `tasks/todo.md` (one plan file per task under `tasks/todo/`, so parallel PRs never conflict)
- [x] 4. Point `AGENTS.md` › Working rules at it; add the release note

## Verification

- [x] `pnpm test`, `pnpm run lint`, `pnpm run typecheck`
- [x] `CLAUDE.md` 28 KB, under the 32 KB budget

## Review

Docs-only change; no shop or admin behaviour changed. Plan files go one per task, like release notes, because a single
shared `todo.md` would conflict across parallel PRs.
