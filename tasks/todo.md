# Task plan template

Copy this file to `tasks/todo/YYYY-MM-DD-<topic>.md` for any non-trivial task (3+ steps or an architectural decision),
fill it in before building, and commit it with the PR. One file per task, so parallel PRs never conflict. Leave this
template unchanged.

---

# <Task title>

**Asked for:** <the owner's request, in their words>
**Done means:** <what is true when this is finished, in one or two sentences>

## Before starting

- [ ] Reviewed `tasks/lessons.md` (relevant lessons: …)
- [ ] Read the area guide(s): <`…/CLAUDE.md` sections>

## Plan

- [ ] 1. …
- [ ] 2. …
- [ ] 3. …

## Verification

- [ ] Tests: `pnpm test` (plus any new test for the change)
- [ ] Typecheck and lint: `pnpm run typecheck`, `pnpm run lint`
- [ ] Behaviour diffed against `main` (how: …)
- [ ] Screenshots for UI changes (phone and desktop, light and dark where it applies)
- [ ] Fresh-context review; "would a staff engineer approve this?"

## Progress notes

<one short line per step as it completes>

## Review

<what changed, what was verified and how, anything left out on purpose, lessons to add to `tasks/lessons.md`>
