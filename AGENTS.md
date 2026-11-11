## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `ldsgroups225/Lohni`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context layout. See `docs/agents/domain.md`.

## Product rules

- The UI is French. Write UI strings, prompts to the model, and error messages shown to the user in French, with accents. This overrides the ASCII rule in `CONTRIBUTING.md`.
- Keep the PageLM credit visible in « Moi » (`frontend/src/pages/Profile.tsx`). The license (`LICENSE`, section 6) requires an in-UI credit. Other screens carry no PageLM branding.
- Revision numbers (session cap, new-card bounds, mastery thresholds, XP, upload and text limits) live in `backend/src/services/revision/policy.ts`. Read them from there in backend and UI.
- Only `storage/uploads`, `storage/smartnotes` and `storage/podcasts` are served publicly (`backend/src/config/storage.ts`). Keep the database and caches private.
- Name branches in English (`feat/daily-review-loop`).

## Revision service

`backend/src/services/revision/` owns profile, chapters, cards, FSRS scheduling, sessions, streak, XP and mastery. Put domain logic there; HTTP routes in `backend/src/core/routes/revision.ts` stay pass-through. Every request carries `X-Device-Id` (UUID) and `X-Local-Date`.

Test through the service interface: a temp SQLite file, an injected clock, a fake card generator. Assert on what the service returns, never on tables or FSRS internals. Model failures map to a `RevisionError` with a clear French message, never a 500.

## Local setup gotchas

- Run `npm install` at the root after pulling dependency changes (e.g. `ts-fsrs`), or backend tests fail on a missing package.
- Install the frontend with `npm ci --prefix frontend` (npm only: a `node_modules` made by pnpm breaks npm; delete it first).
- `nodemon` is not installed: start the backend with `npx tsx backend/src/core/index.ts` (port 5000). Frontend: `npx vite --host 127.0.0.1 --port 5173` from `frontend/`.
- Frontend tests: `npx vitest run frontend/src` (`npm test` covers `backend/src` and `frontend/src`).
- OpenRouter may refuse `LLM_MAXTOK=16384` for lack of credits (HTTP 402). Override for the run (`LLM_MAXTOK=4000 npx tsx ...`) rather than editing `.env`.

## Done means

`npm test`, `npx vitest run frontend/src`, `npm run build`, `npm run build --prefix frontend`, `npm run lint` and `npm run lint --prefix frontend` all pass. For UI changes, also walk the flow in Orca's built-in browser at phone size:

- Use `viewport --width 390 --height 844 --scale 1 --mobile`; `set device` produces tiled screenshots.
- When a click reports it is covered by `#__orca-grab-host` (Orca's overlay), `focus` the element and press Enter.
- Routes: `/` (onboarding, then home), `/revision`, `/courses`, `/import`, `/tutor`, `/me`.

## Multi-agent workflow

For a spec issue (`ready-for-agent`):

1. Split it into ticket issues, one per delivery step, each with a `Blocked by: #n` line.
2. Create an English-named integration branch from `main`.
3. Run one worker per unblocked ticket, in its own worktree based on the integration branch, using `tdd`. Before reporting, the worker merges the integration tip and shows the test and build results above.
4. Fast-forward the integration branch onto the worker's branch (`git merge-base --is-ancestor` then `git update-ref`), close the ticket with the commit, and start the newly unblocked tickets. Agree on a shared API contract up front when two parallel tickets touch the same service.
5. When all tickets are in, review on two axes (standards, spec), send all fixes to one fresh worker, then run a reviewer that loops review→fix until a full pass is clean.
6. Walk the app in the browser, merge into `main`, and push once the owner approves.

When a fix interacts with an earlier feature (e.g. a date guard against the offline queue), have the worker report residual risks and read them before merging.

### Orca orchestration

The coordinator supervises; Codex workers implement. Workers are Orca workers, not the coordinator's own subagents.

- **CLI**: use `$ORCA_CLI_COMMAND` (else `orca-ide` on Linux). Bare `orca` outside an Orca terminal is the GNOME screen reader. Load the guide once with `<cli> skills get orchestration`.
- **Spawn**: write the task to a spec file, then
  `<cli> orchestration worker-start --spec-file <file> --task-title "#<n> <title>" --agent codex --model <model> --worktree new-top-level --repo id:<repoId> --name lohni-<ticket> --base-branch <integration-branch> --run <runId> --json`.
  `<cli> repo list --json` gives the repo id. The first `worker-start` creates the Run; pass its `--run` to every later worker. Start every unblocked worker, then end the turn: Orca wakes the coordinator on `worker_done`, `question` or `escalation`.
- **Worker spec**: self-contained, pointing to the issue and spec rather than copying them. It states:
  - the base-branch check (`git reset --hard <integration-branch>` when off base);
  - `tdd`;
  - the allowed edits;
  - no push, no `main`, no issue closing;
  - merging the integration tip before reporting;
  - the evidence to return (branch, sha, test counts, builds, what is left undone).

  A failing test or build means the Task failed.
- **Talk**: answer a worker's `question` with `<cli> orchestration reply --id <msgId> --body "..."`. Steer or hand follow-up work with `<cli> orchestration send --to dispatch:<dispatchId> --subject ... --body ...`; a finished worker gets it as a new Task.
- **Coordinator**: reads the worker's evidence and spot-checks risky diffs (security, data), rerunning checks only on a gap. It owns integration, ticket closing and user decisions; product or legal choices go to the owner.
- **Cleanup**: after integrating, `<cli> orchestration worker-release --dispatch <id>`, then `<cli> worktree rm --worktree path:<path> --delete-branch` (`--force` only when the sole leftover is untracked `graphify-out/`).
